// Cloudflare Pages Function: Proxy for crowdsource label submission
// POST /api/labels -> Lambda Function URL

export async function onRequestPost(context) {
  const LAMBDA_URL = context.env.SUBMIT_LABEL_LAMBDA_URL;
  const API_SECRET = context.env.API_SHARED_SECRET;

  if (!LAMBDA_URL) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await context.request.text();

  try {
    const response = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_SECRET && { 'X-Api-Secret': API_SECRET }),
      },
      body,
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
