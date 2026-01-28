// Cloudflare Pages Function: Proxy for admin labels API
// GET /api/admin/labels -> Lambda Function URL (fetch labels for date range)

export async function onRequestGet(context) {
  const LAMBDA_URL = context.env.ADMIN_LABELS_LAMBDA_URL;
  const API_SECRET = context.env.API_SHARED_SECRET;

  if (!LAMBDA_URL) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Forward query parameters to Lambda
  const url = new URL(context.request.url);
  const lambdaUrl = new URL(LAMBDA_URL);
  url.searchParams.forEach((value, key) => {
    lambdaUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(lambdaUrl.toString(), {
      method: 'GET',
      headers: {
        ...(API_SECRET && { 'X-Api-Secret': API_SECRET }),
      },
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
