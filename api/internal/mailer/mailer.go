// Package mailer 极简 SMTP 发送:net/smtp + PlainAuth,服务器支持时自动 STARTTLS。
// 仅支持 587 形态;465 隐式 TLS 不在 net/smtp.SendMail 能力内(UI 文案已注明)。
package mailer

import (
	"fmt"
	"net"
	"net/smtp"
)

func Send(host, port, username, password, from, to, subject, body string) error {
	if host == "" || port == "" || from == "" {
		return fmt.Errorf("mailer: smtp not configured")
	}
	var auth smtp.Auth
	if username != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}
	msg := []byte("From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" +
		body + "\r\n")
	return smtp.SendMail(net.JoinHostPort(host, port), auth, from, []string{to}, msg)
}
