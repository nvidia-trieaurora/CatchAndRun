import { Router, Request, Response, NextFunction } from "express";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const ADMIN_GITHUB_USERNAME = process.env.ADMIN_GITHUB_USERNAME || "";

export const authRouter = Router();

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.adminUser) {
    return next();
  }
  res.redirect("/admin/login");
}

authRouter.get("/login", (_req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.send("GITHUB_CLIENT_ID not configured. Set env vars.");
  }
  const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;
  res.redirect(redirect);
});

authRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("Missing code");

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) return res.status(401).send("OAuth failed");

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "CatchAndRun" },
    });
    const userData = await userRes.json() as any;

    if (userData.login !== ADMIN_GITHUB_USERNAME) {
      return res.status(403).send(`Access denied. Only ${ADMIN_GITHUB_USERNAME} can access the admin panel.`);
    }

    (req.session as any).adminUser = userData.login;
    res.redirect("/admin");
  } catch (err) {
    res.status(500).send("OAuth error: " + String(err));
  }
});

authRouter.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});
