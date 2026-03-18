export default async function handler(req, res) {
  const value = String(req.query?.value || req.body?.value || '').trim();
  const expected =
    process.env.VAULTUM_LOCAL_SECRET
    || process.env.ADMIN_SECRET
    || process.env.LOCAL_OPERATOR_SECRET
    || '';

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(200).json({
    valid: Boolean(value) && Boolean(expected) && value === expected,
    configured: Boolean(expected),
    note: expected
      ? 'Local operator secret is configured.'
      : 'No local operator secret is configured in this environment.',
  });
}
