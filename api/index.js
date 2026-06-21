module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  return res.status(200).json({
    success: true,
    name: "Nova Exchange API",
    version: "2.0",
    endpoints: {
      register: "/api/register",
      login: "/api/login",
      me: "/api/me",
      dashboard: "/api/me/dashboard",
      transactions: "/api/me/transactions",
      downlines: "/api/me/downlines",
      commissions: "/api/me/commissions",
      bindEmail: "/api/me/bind-email",
      sendCode: "/api/send-code",
      verifyCode: "/api/verify-code",
      resetPassword: "/api/reset-password"
    },
    docs: "https://www.alh777.com/countries/nigeria/Nigeria.html",
    status: "operational"
  });
};
