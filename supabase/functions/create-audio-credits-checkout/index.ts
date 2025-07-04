
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user?.email) {
      throw new Error("User not authenticated");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Try to get the credit product from database, if not found use default values
    let productData = {
      name: "20 Créditos de Áudio",
      credits: 20,
      price: 499 // $4.99 in cents
    };

    try {
      const { data: product } = await supabaseClient
        .from('audio_credit_products')
        .select('name, credits, price')
        .single();

      if (product) {
        productData = {
          name: product.name,
          credits: product.credits,
          price: product.price
        };
        console.log("Product found in database:", productData);
      }
    } catch (productError) {
      console.log("No product found in database, using default values:", productData);
    }

    // Check if customer exists
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    let customer_id = undefined;
    if (customers.data.length > 0) {
      customer_id = customers.data[0].id;
    }

    // Detectar a página atual baseada no referer
    const referer = req.headers.get("referer") || "";
    let successUrl = `${req.headers.get("origin")}/chat-text-audio?credits_success=true&credits=${productData.credits}`;
    let cancelUrl = `${req.headers.get("origin")}/chat-text-audio?credits_canceled=true`;
    
    if (referer.includes("/chat-trial")) {
      successUrl = `${req.headers.get("origin")}/chat-trial?credits_success=true&credits=${productData.credits}`;
      cancelUrl = `${req.headers.get("origin")}/chat-trial?credits_canceled=true`;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer_id,
      customer_email: customer_id ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productData.name,
              description: `${productData.credits} créditos de áudio`,
            },
            unit_amount: productData.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        credits: productData.credits.toString(),
        user_id: user.id,
        credit_type: "audio",
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
