# Fund Real Time Valuation

Fund Real Time Valuation 是一个面向个人投资者的基金实时估值查询与展示工具。项目采用前后端分离架构，前端提供响应式 Web 页面，后端通过 Python API 获取、清洗并缓存中国大陆公募基金估值数据。

当前版本支持：

- 通过基金代码或基金名称搜索基金
- 添加基金到本地关注列表
- 展示估算净值、估算涨跌幅、净值日期、估值时间和数据状态
- 手动刷新全部基金或单只基金
- 删除已关注基金
- 使用浏览器 `localStorage` 保存关注列表
- 手机和桌面浏览器自适应布局

## 技术栈

- 后端：Python、FastAPI、httpx、pydantic
- 前端：React、TypeScript、Vite、Vitest
- 数据源：东方财富 / 天天基金公开接口适配层

## 环境准备

请先确认本机已安装：

- Python 3.11 或更高版本
- Node.js 20 或更高版本
- npm
- Git

建议分别安装后端和前端依赖。

后端依赖：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

前端依赖：

```powershell
cd frontend
npm install
```

## 快速启动

启动后端 API 服务：

```powershell
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

如果没有使用虚拟环境，也可以运行：

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

启动前端开发服务：

```powershell
cd frontend
npm run dev
```

打开浏览器访问：

```text
http://localhost:5173
```

前端开发服务会将 `/api` 和 `/health` 请求代理到：

```text
http://localhost:8000
```

## 常用验证命令

后端测试：

```powershell
cd backend
python -m pytest -v
```

前端测试：

```powershell
cd frontend
npm run test
```

前端构建：

```powershell
cd frontend
npm run build
```

## API 简览

健康检查：

```http
GET /health
```

基金搜索：

```http
GET /api/funds/search?q=161725
```

基金估值：

```http
POST /api/funds/valuations
Content-Type: application/json

{
  "codes": ["161725"],
  "force": true
}
```

## 说明

后端的数据源访问逻辑集中在 `backend/app/adapters` 中，业务服务和 API 路由不直接绑定具体第三方接口，后续可以替换或增加新的数据源适配器。

当前数据源请求默认不读取系统代理环境变量，避免本机代理配置异常导致后端无法访问基金数据源。
