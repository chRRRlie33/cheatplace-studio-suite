import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  offerTitle: string;
  offerDescription: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offerTitle, offerDescription }: NotifyRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Récupérer tous les utilisateurs avec leurs emails depuis auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error("Error fetching users:", authError);
      throw new Error("Erreur lors de la récupération des utilisateurs");
    }

    const emails = authUsers.users
      .map(user => user.email)
      .filter((email): email is string => !!email);

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun utilisateur à notifier" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Envoyer les emails en batch (Resend supporte jusqu'à 100 destinataires en BCC)
    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push(emails.slice(i, i + batchSize));
    }

    const results = [];
    
    for (const batch of batches) {
      const emailResponse = await resend.emails.send({
        from: "CHEATPLACE-STUDIO <onboarding@resend.dev>",
        to: "noreply@cheatplace.studio",
        bcc: batch,
        subject: `🎉 Nouvelle offre disponible : ${offerTitle}`,
        html: `
          <!DOCTYPE html>
          <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #333;">
                    <tr>
                      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                          <span style="font-family: monospace;">CHEATPLACE</span>-<span style="font-style: italic;">STUDIO</span>
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #ffffff; font-size: 24px;">
                          🎉 Nouvelle offre disponible !
                        </h2>
                        <h3 style="margin: 0 0 15px 0; color: #a78bfa; font-size: 20px;">
                          ${offerTitle}
                        </h3>
                        <p style="margin: 0 0 30px 0; color: #a1a1aa; font-size: 16px; line-height: 1.6;">
                          ${offerDescription.substring(0, 200)}${offerDescription.length > 200 ? '...' : ''}
                        </p>
                        <a href="https://cheatplace.studio" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                          Voir l'offre →
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px 30px; border-top: 1px solid #333; text-align: center;">
                        <p style="margin: 0; color: #71717a; font-size: 14px;">
                          © 2024 CHEATPLACE-STUDIO. Tous droits réservés.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });
      
      results.push(emailResponse);
    }

    console.log("Emails sent successfully to", emails.length, "users");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Emails envoyés à ${emails.length} utilisateurs`,
        results 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-new-offer function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
