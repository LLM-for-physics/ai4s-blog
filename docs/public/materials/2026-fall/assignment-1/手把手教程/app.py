"""教程的起始骨架：能打开网页并演示回复，还没有模型调用或历史功能。"""

import html
from flask import Flask, request

app = Flask(__name__)


def get_reply(question):
    # 先用演示回复走通网页流程，随后在这里接入真实模型。
    return "这是演示回复，我收到了：" + question


def make_page(question, answer, error_text):
    page = '<!doctype html><html lang="zh-CN"><head>'
    page = page + '<meta charset="utf-8">'
    page = page + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    page = page + '<title>我的对话程序</title></head><body>'
    page = page + '<h1>我的对话程序</h1>'
    page = page + '<p>起始骨架：目前只有演示回复，尚未接入 AI，也不保存历史。</p>'

    if error_text != "":
        page = page + '<p>' + html.escape(error_text) + '</p>'

    if answer != "":
        page = page + '<h2>这次的输入</h2>'
        page = page + '<pre style="white-space: pre-wrap">' + html.escape(question) + '</pre>'
        page = page + '<h2>这次的回复</h2>'
        page = page + '<pre style="white-space: pre-wrap">' + html.escape(answer) + '</pre>'

    page = page + '<form action="/" method="post">'
    page = page + '<p><label for="question">输入内容</label></p>'
    page = page + '<textarea id="question" name="question" rows="4" cols="30">'
    page = page + html.escape(question) + '</textarea><br>'
    page = page + '<button type="submit">发送</button></form>'
    page = page + '</body></html>'
    return page


def index():
    question = ""
    answer = ""
    error_text = ""

    if request.method == "POST":
        question = request.form.get("question", "").strip()
        if question == "":
            error_text = "请先输入内容。"
        else:
            answer = get_reply(question)

    return make_page(question, answer, error_text)


app.add_url_rule("/", view_func=index, methods=["GET", "POST"])

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8500, debug=False, threaded=False)