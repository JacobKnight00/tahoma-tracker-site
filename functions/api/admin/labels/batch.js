// Cloudflare Pages Function: Proxy for admin batch label submission
// POST /api/admin/labels/batch -> Lambda Function URL /batch

export async function onRequestPost(context) {
  const LAMBDA_URL = context.env.ADMIN_LABELS_LAMBDA_URL;
  const API_SECRET = context.env.API_SHARED_SECRET;

  if (!LAMBDA_URL) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await context.request.text();

  // Append /batch to the Lambda URL
  const batchUrl = LAMBDA_URL.replace(/\/$/, '') + '/batch';

  try {
    const response = await fetch(batchUrl, {
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
