# Mcp Server

参考官方文档: [Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server) 和 [Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

Model-Context-Protocol (MCP) Server 是一个遵循 MCP 规范的应用程序，它向 AI 模型或 Agent 暴露一组工具。这使得 AI 可以通过一个标准化的协议来发现和调用这些工具。

本节将指导你如何使用 `fastmcp` 库构建一个简单的 MCP 服务器。

## 核心概念与示例

一个 MCP 服务器主要包含以下部分：
1.  **服务器实例**: 使用 `FastMCP` 初始化，并指定一个唯一的 `namespace`。
2.  **工具 (Tools)**: 使用 `@mcp.tool()` 装饰器将 Python 函数注册为可供 AI 调用的工具。函数的类型提示 (Type Hint) 和文档字符串 (Docstring) 至关重要，因为它们会被转换成工具的元数据，供 AI 理解如何使用该工具。
3.  **传输方式 (Transport)**: 定义服务器如何与客户端（如 AI Agent）通信。常见的方式有 `stdio`（标准输入/输出）、`http` 等。

### 一个简单的计算器服务器

下面是一个简单的计算器服务器示例，它提供了一个加法工具。

```python
# calculator_server.py
from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP

# 1. 初始化 FastMCP 服务器，并指定命名空间为 "calculator"
mcp = FastMCP("calculator")

# 2. 使用 @mcp.tool() 装饰器定义一个工具
@mcp.tool()
async def add_two_numbers(number_x: int, number_y: int) -> int:
    """Calculate the value of number_x + number_y

    Args:
        number_x: the first integer
        number_y: the second integer
    """
    return number_x + number_y

if __name__ == "__main__":
    # 3. 初始化并运行服务器，使用 stdio 作为传输方式
    mcp.run(transport='stdio')
```

## 运行与测试

### 1. 运行服务器

将以上代码保存为 `calculator_server.py`，然后在终端中运行它：

```bash
python calculator_server.py
```

服务器启动后，会阻塞并等待来自标准输入 (stdin) 的 MCP 请求。

### 2. 发送测试请求

由于我们使用了 `stdio` 传输，我们可以直接在终端中输入 JSON 格式的 MCP 请求来测试工具。

打开一个新的终端，或者直接在运行服务器的终端中（取决于你的环境），粘贴以下 JSON 请求，然后按 `Enter`：

```json
{"mcp_version":"0.1.0","request_id":"req_123","namespace":"calculator","tool_name":"add_two_numbers","parameters":{"number_x": 5, "number_y": 7}}
```

### 3. 查看响应

服务器在收到请求后，会执行 `add_two_numbers` 函数，并通过标准输出 (stdout) 返回结果。你应该能看到类似下面的 JSON 响应：

```json
{"mcp_version":"0.1.0","request_id":"req_123","status_code":200,"content_type":"application/json","content":{"result":12}}
```

这表明服务器已成功调用工具并返回了 `5 + 7` 的计算结果 `12`。

## Streamable HTTP 传输

除了 `stdio`，MCP 还支持更灵活的 `Streamable HTTP` 传输方式。这种方式将 MCP 服务器作为一个独立的 HTTP 服务运行，允许客户端通过网络进行通信，更适合生产环境或需要与 Web 应用集成的场景。

`Streamable HTTP` 传输有以下特点：
- **单一入口**: 服务器提供一个单一的 HTTP 端点（例如 `/mcp`），同时支持 `GET` 和 `POST` 请求。
- **客户端请求**: 客户端通过向该端点发送 `HTTP POST` 请求来调用工具。
- **服务器响应**: 服务器可以返回单个 JSON 对象，也可以通过服务器发送事件 (SSE) 建立一个流式连接，从而实现更复杂的交互，例如服务器主动向客户端发送通知或请求。

### 1. 修改服务器代码

要将我们的计算器服务器从 `stdio` 切换到 `http`，只需对 `mcp.run()` 方法进行简单的修改。

```python
# calculator_server_http.py
from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("calculator")

@mcp.tool()
async def add_two_numbers(number_x: int, number_y: int) -> int:
    """Calculate the value of number_x + number_y

    Args:
        number_x: the first integer
        number_y: the second integer
    """
    return number_x + number_y

if __name__ == "__main__":
    # 将 transport 修改为 'http'，并可以指定 host 和 port
    mcp.run(transport='http', host='127.0.0.1', port=8000)
```

### 2. 运行与测试

将以上代码保存为 `calculator_server_http.py` 并运行：

```bash
python calculator_server_http.py
```

服务器现在会启动并监听在 `http://127.0.0.1:8000`。

接下来，我们可以使用 `curl` 等工具来发送 `POST` 请求，以测试 `add_two_numbers` 工具。打开一个新的终端，执行以下命令：

```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"mcp_version":"0.1.0","request_id":"req_123","namespace":"calculator","tool_name":"add_two_numbers","parameters":{"number_x": 5, "number_y": 7}}' \
     http://127.0.0.1:8000/mcp
```

- `fastmcp` 默认的端点路径是 `/mcp`。

服务器会返回与 `stdio` 示例中类似的 JSON 响应：

```json
{"mcp_version":"0.1.0","request_id":"req_123","status_code":200,"content_type":"application/json","content":{"result":12}}
```

### 3. 安全注意事项

当使用 HTTP 传输时，尤其是在生产环境中，必须考虑以下安全措施：
- **验证来源 (`Origin`)**: 服务器应验证所有传入连接的 `Origin` 请求头，以防止 DNS 重新绑定攻击。
- **绑定地址**: 在本地开发时，应仅将服务器绑定到 `localhost` (`127.0.0.1`)，而不是所有网络接口 (`0.0.0.0`)，以避免暴露在局域网中。
- **身份验证**: 对所有连接实施适当的身份验证机制，确保只有授权的客户端才能访问工具。