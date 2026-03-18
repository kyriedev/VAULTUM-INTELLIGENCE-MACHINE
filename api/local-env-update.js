export default async function handler(_req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(405).json({
    updated: false,
    error: 'Runtime environment mutation is disabled from the HTTP surface. Update local secrets through the host environment instead.',
  });
}
