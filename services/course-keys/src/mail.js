import nodemailer from "nodemailer";
export function createMailer(config) {
  const ready = Boolean(
    config.smtp.host &&
    config.smtp.from &&
    config.smtp.user &&
    config.smtp.pass,
  );
  const transport = ready
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        requireTLS: true,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        logger: false,
        debug: false,
      })
    : null;
  return {
    configured: ready,
    async send({ email, code }) {
      if (!transport) throw new Error("Mail is not configured");
      await transport.sendMail({
        from: config.smtp.from,
        to: email,
        subject: "课程服务器公钥管理验证码",
        text: `您的验证码为 ${code}，10 分钟内有效。请勿向他人提供。若非本人操作，请忽略本邮件。`,
      });
    },
    close() {
      transport?.close();
    },
  };
}
