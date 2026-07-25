# Implementation notes — Latch integration

Ghi quyết định thực tế trong lúc làm, khác với `README-latch-integration.md` (spec gốc) ở những chỗ spec đoán sai hoặc không nói tới.

## CP-0 — Xác nhận kiến trúc (2026-07-25)

### 1. Contract EscrowMAD đã có state `Disputed` chưa?

**Chưa có.** `enum State` hiện tại (EscrowMAD.sol) chỉ có: `AWAITING_BUYER, ACTIVE, CANCEL_REQUESTED, RETURN_REQUESTED, COMPLETED, CANCELLED, SELLER_CLAIMED`. Toàn bộ luồng dựa trên đồng thuận 2 bên hoặc timeout, không có nhánh nào dẫn vào tranh chấp.

**Lệch với spec:** `README-latch-integration.md` mục 4 chỉ phác thảo hàm `resolveDispute`, giả định trạng thái `Disputed` đã tồn tại và có cách nào đó để vào được trạng thái đó. Thực tế phải tự thêm cả hai:
- State `DISPUTED` mới trong enum.
- Hàm `raiseDispute()` — buyer hoặc seller gọi được khi đang ở `ACTIVE`, `CANCEL_REQUESTED`, hoặc `RETURN_REQUESTED`, chuyển sang `DISPUTED`, đóng băng mọi hành động khác (cancel/return/confirm...) cho tới khi agent resolve.

### 2. Ví agent đã có địa chỉ chưa?

**Chưa có.** Và quan trọng hơn: **không có khái niệm `owner` nào** trong `EscrowMAD.sol` lẫn `EscrowFactory.sol` — không `Ownable`, không biến `owner`, không modifier `onlyOwner`. Bản phác thảo CP1 trong spec viết `function setAgent(address _agent) external onlyOwner` nhưng `onlyOwner` đó không có chỗ bám.

Thêm nữa, mỗi giao dịch escrow là **1 contract EscrowMAD deploy riêng** qua `EscrowFactory.createEscrow()` (permissionless — bất kỳ ai làm seller cũng deploy được). Nếu agent set riêng từng instance thì phải gọi `setAgent` trên từng contract sau khi deploy, mà không có ai giữ quyền gọi.

**Quyết định (đã duyệt):**
- Thêm `owner` (= deployer của Factory, tức bạn) và `agent` (set 1 lần) vào `EscrowFactory.sol`.
- `EscrowMAD` giữ địa chỉ `factory` (truyền vào constructor, giống cách `sbtContract` đang được truyền), đọc `agent` qua `IEscrowFactory(factory).agent()` tại thời điểm resolve — không cần gọi `setAgent` trên từng escrow.

Cần: tạo ví mới cho agent + xin faucet Sepolia trước khi deploy lại Factory (agent wallet chỉ dùng testnet, không dùng ví thật — đúng quy tắc "Không cho agent script cầm private key" ở mục 9 spec, ví agent chỉ ký tx qua API route trên Vercel, không phải agent script Groq).

### 3. Header xác thực Latch dùng gì?

**`Authorization: Bearer <token>`**. Lấy token thật từ trang Connect trong dashboard Latch, điền vào `LATCH_API_KEY` trong `.env` của agent script (không commit).

---

## Việc này làm thay đổi phạm vi CP-1 so với spec gốc

Spec gốc (mục 4) chỉ phác thảo thêm `resolveDispute` + `onlyAgent` + `setAgent` vào EscrowMAD. Thực tế CP-1 cần:

1. **EscrowFactory.sol**: thêm `owner`, `agent`, `onlyOwner`, `setAgent(address)`.
2. **EscrowMAD.sol**:
   - Thêm state `DISPUTED` vào enum.
   - Thêm `factory` (immutable, truyền vào constructor).
   - Thêm `raiseDispute()` — `onlyParticipant`, chỉ gọi được khi `ACTIVE`/`CANCEL_REQUESTED`/`RETURN_REQUESTED`.
   - Thêm `resolveDispute(bool releaseToSeller)` — kiểm tra `msg.sender == IEscrowFactory(factory).agent()`, chỉ chạy khi `state == DISPUTED`.
3. Constructor `EscrowMAD` phải nhận thêm tham số `_factory` → `EscrowFactory.createEscrow()` phải truyền `address(this)` vào khi deploy.

Chưa code phần này — chờ duyệt phạm vi CP-1 trước khi viết.

---

## CP-2 — API route `app/api/agent/resolve-dispute/route.js` (2026-07-25)

`orderId` = index trong `EscrowFactory.allEscrows` (đã chốt ở phần thảo luận trước, đánh đổi: reset về 0 mỗi lần redeploy Factory — chấp nhận được vì redeploy Factory vốn đã phải cập nhật `FACTORY_ADDRESS` trong `.env`).

Đã test end-to-end trên local (chainId set = 11155111 trong `hardhat.config.js` network `hardhat`, để khớp `chain: sepolia` mà route dùng khi ký tx — nếu không set, ký tx local sẽ bị node từ chối do lệch chainId):
- Không có token / sai token → 401.
- Body sai (`decision` rác) → 400.
- Order không ở trạng thái Disputed → 409.
- Token đúng + body hợp lệ + Disputed → tx thật lên chain, state chuyển COMPLETED, response 200 đúng format spec.
- Lỗi ghi Firebase (permission-denied, xem bên dưới) không làm hỏng response — đã bọc try/catch riêng, vì tx đã gửi xong rồi thì không được để bước log phụ làm mất kết quả trả về.

**Việc còn treo, cần bạn làm (không tự làm được):**
- Ví agent thật chưa tồn tại — cần tạo ví mới (chỉ Sepolia, không dùng ví thật) + xin faucet, rồi điền `AGENT_PRIVATE_KEY` vào `.env.local` (server-only, không `NEXT_PUBLIC_`).
- `ESCROWMAD_GATEWAY_TOKEN` — tự sinh chuỗi ngẫu nhiên ≥32 ký tự, điền vào `.env.local`, đồng thời điền đúng chuỗi này khi tạo secret trên dashboard Latch (mục 3 spec).
- Firestore Rules: cần mở quyền ghi cho collection `disputeResolutions` trên Firebase Console (giống `reviews`/`reputations` trước đây) — test local vừa rồi bị `PERMISSION_DENIED` ở đúng bước này.
- Header `Authorization: Bearer <token>` mà route đang check là suy đoán dựa trên câu trả lời trước đó của bạn, KHÔNG phải xác nhận từ dashboard Latch thật (Latch chưa được set up). Cần đối chiếu lại khi có dashboard thật — nếu Latch dùng header khác (vd `X-Latch-Secret`), phải sửa dòng check header trong route.

**Không thuộc phạm vi CP-2 (ghi nhận riêng):**
- App hiện chưa có nút nào để buyer/seller gọi `raiseDispute()` — cần quyết định làm ở checkpoint nào.
- `STATE_LABELS`/`STATE_COLORS`/`STATE` trong `app/page.jsx` chỉ có 7 giá trị (0-6), chưa có `DISPUTED` (7) — nếu 1 order vào trạng thái này, UI hiện tại sẽ hiển thị sai/lỗi. Cần sửa khi làm phần UI liên quan tới dispute.

Env vars mới cần trong `.env.local` (server-only, không set thì route throw lỗi khi gọi):
```
AGENT_PRIVATE_KEY=
ESCROWMAD_GATEWAY_TOKEN=
```
Route tái dùng `NEXT_PUBLIC_RPC_URL` và `NEXT_PUBLIC_FACTORY_ADDRESS` đã có sẵn, không tạo biến trùng.

---

## CP-3 — Agent script `scripts/agent/resolve-disputes.mjs` (2026-07-25)

### Lệch với spec, đã xử lý

**1. Ảnh không nằm ở `public/disputes/`.** Spec mục 6 giả định 2 file ảnh local theo `<category>-ordered` / `<category>-received`. Thư mục `public/disputes/` **không tồn tại** và chưa từng tồn tại. Thực tế dApp lưu ảnh trên IPFS qua Pinata, và contract đã có sẵn đúng 2 thứ cần:
- `itemImageHash` = ảnh seller đăng lúc tạo deal → vai trò "ordered"
- `returnEvidenceHash` = ảnh buyer chụp hàng nhận lúc `requestReturn` → vai trò "received"

Script đọc 2 hash này từ contract rồi tải qua gateway (`IPFS_GATEWAY`, mặc định `https://gateway.pinata.cloud/ipfs/`) và đổi sang base64. Cách này tốt hơn spec gốc vì dùng đúng bằng chứng đã nằm on-chain, không phải file demo đặt tay.

**2. Trường hợp thiếu ảnh.** `raiseDispute()` gọi được từ `ACTIVE` và `CANCEL_REQUESTED`, mà 2 trạng thái đó không đảm bảo có `returnEvidenceHash`. Khi thiếu 1 trong 2 ảnh, script **bỏ qua order đó và in cảnh báo**, không gọi Groq, không gửi gì. Không có bằng chứng thì không phán xử.

**3. Dùng `.mjs` thay vì `.ts`** như spec ghi. Lý do: chạy thẳng bằng `node` không cần thêm `tsx`/`ts-node`. Frontend cũng đang là JS thuần (`.jsx`/`.js`), nên `.mjs` hợp với codebase hơn. Env đọc bằng cờ `--env-file` có sẵn của Node, không cần package `dotenv`.

**4. Model Groq: `qwen/qwen3.6-27b`.** Tra từ `console.groq.com/docs/vision` chứ không nhớ theo trí nhớ — các model llama vision cũ đã bị gỡ. Đổi được qua env `GROQ_MODEL`. Giới hạn: ảnh tối đa 20MB, tối đa 5 ảnh/request (script gửi 2).

**5. Thêm override `GROQ_URL` qua env.** Không có trong spec. Thêm để test được toàn tuyến bằng mock server mà không cần key thật (đồng bộ với `GROQ_MODEL`/`IPFS_GATEWAY` vốn đã override được). Mặc định vẫn trỏ Groq thật.

### Đã test những gì (chain local, chainId 11155111)

| Tình huống | Kết quả |
|---|---|
| Thiếu biến env | Báo tên biến thiếu, exit 1, không chạy tiếp |
| Đọc on-chain | Đọc đúng `getTotalEscrows`, lọc đúng order ở state `DISPUTED` |
| Order thiếu ảnh | Bỏ qua, in cảnh báo, không gọi Groq/Latch |
| Groq key sai | HTTP 401 tới được Groq (request đúng format), in lỗi rồi dừng |
| Toàn tuyến (mock Groq) | Tải ảnh IPFS thật → Groq → bóc ` ```json ` fence → POST route → **tx thật lên chain**, buyer nhận đủ 1.4 ETH, escrow về 0, state `COMPLETED` |
| Groq trả JSON hỏng | DỪNG, in nguyên văn, exit 1, **không gửi request** |
| Groq trả `decision` lạ (`send_all_to_me`) | DỪNG, in giá trị sai, exit 1, **không gửi request** |

Hai case cuối đã kiểm chứng bằng số dư: escrow vẫn giữ nguyên 1.4 ETH sau khi script dừng, tức không có lệnh nào lọt qua.

### Chưa test được (cần key thật của bạn)

- Groq thật trả JSON đúng format hay không (mới test bằng mock).
- Đường đi qua Latch thật. Lúc test tôi trỏ `LATCH_PROXY_URL` thẳng vào `http://localhost:3000`, tức bỏ qua tầng Latch. Khi có Latch thật, `LATCH_API_KEY` là key để script xác thực **với Latch**, còn `ESCROWMAD_GATEWAY_TOKEN` do Latch tự gắn vào khi forward — hai thứ khác nhau, đừng điền trùng.

### Cần bạn điền

Copy `scripts/agent/.env.example` thành `scripts/agent/.env` rồi điền `GROQ_API_KEY`, `LATCH_PROXY_URL`, `LATCH_API_KEY`, `RPC_URL`, `FACTORY_ADDRESS`. File `.env` đã nằm trong `.gitignore`.

Chạy: `node --env-file=scripts/agent/.env scripts/agent/resolve-disputes.mjs`

---

## CP-4 — Trang admin + đăng nhập Google Authenticator (2026-07-25)

### Breaking change của Next 16 suýt gây lỗ hổng

**Next.js 16 đổi tên `middleware.ts` thành `proxy.ts`.** Nếu đặt tên file là `middleware.js` theo thói quen cũ thì Next **không chạy nó và cũng không báo lỗi** - trang admin trông như đã khoá nhưng thực tế ai gõ URL cũng vào được. Cách kiểm chứng: chạy `npm run build`, output phải có dòng `ƒ Proxy (Middleware)`. Không có dòng đó là file chưa được nhận diện.

### otplib v13 khác v12 hoàn toàn

- Không còn `authenticator.*`. API mới: `generateSecret()`, `generate({secret})`, `verify({secret, token})`, `generateURI({issuer, label, secret})`.
- **`verify()` trả về object `{valid: boolean}`, KHÔNG phải boolean.** Viết `if (await verify(...))` là luôn đúng vì object luôn truthy - tức ai nhập mã gì cũng đăng nhập được. Phải đọc `.valid`.
- Dung sai lệch giờ dùng `epochTolerance`, tính bằng **giây** (v12 dùng `window`, tính theo bước 30 giây). Đang đặt 30 giây.

### Bảo vệ 2 lớp

Theo đúng khuyến nghị trong docs của Next (`proxy` chạy trên mọi request kể cả prefetch nên không làm việc nặng ở đó):
1. `proxy.js` - chỉ kiểm tra cookie **có tồn tại** hay không, thiếu thì đá về `/admin/login`.
2. `app/admin/disputes/page.jsx` - xác minh **chữ ký HMAC thật** + hạn dùng. Đây mới là lớp chặn thật.

Session ký bằng HMAC-SHA256 qua **Web Crypto** (không phải `node:crypto`) để chạy được cả trong Edge runtime của proxy. Cookie `httpOnly`, hạn 8 tiếng, hạn dùng nằm trong phần được ký nên không kéo dài được.

### Đã test

| Tình huống | Kết quả |
|---|---|
| Vào `/admin/disputes` chưa đăng nhập | 307 về `/admin/login` |
| Mã sai | 401 |
| Mã không đủ 6 chữ số | 400 |
| Mã đúng | 200 + cookie `httpOnly` |
| Cookie hợp lệ | Trang hiện nội dung |
| Cookie bịa hoàn toàn | 0 dấu hiệu nội dung admin bị rò rỉ |
| Cookie kéo dài hạn, giữ chữ ký cũ | 0 dấu hiệu rò rỉ |
| Cookie hết hạn | 0 dấu hiệu rò rỉ |

Lưu ý khi đọc kết quả: 3 trường hợp giả mạo trả **HTTP 200** chứ không phải 307. Đó là cách App Router xử lý `redirect()` trong server component (trả kèm chuyển hướng phía client). Đã kiểm chứng bằng nội dung body: không rò rỉ gì.

### Gộp ABI về một chỗ - sửa lỗi thật

`lib/escrowAbi.mjs` giờ là nguồn duy nhất cho ABI + hằng số trạng thái, dùng chung bởi `app/page.jsx`, API route, agent script và trang admin. Trước đó mỗi nơi một bản, dẫn tới lỗi thật: `STATE_LABELS` trong `page.jsx` chỉ có 7 phần tử (0-6), nên đơn ở trạng thái `DISPUTED` (=7) sẽ hiện `undefined`. Đã bỏ 56 dòng trùng khỏi `page.jsx`.

Dùng đuôi `.mjs` để plain `node` (agent script) đọc được mà không cảnh báo, Next vẫn resolve được không cần ghi đuôi.

### Còn thiếu, nên biết

- **Không có rate limit trên `/api/admin/login`.** Mã chỉ 6 chữ số, đổi mỗi 30 giây. Về lý thuyết có thể dò tự động. Serverless không giữ được bộ đếm trong RAM nên muốn chặn thật phải dùng Upstash Redis - xem skill `dapp-production-checklist` mục 2. Chưa làm vì chưa mở cho người ngoài.
- Trang admin chưa có nút đăng xuất. Xoá cookie thủ công hoặc chờ hết 8 tiếng.

### Cần bạn làm

1. Chạy `node scripts/admin/setup-totp.mjs`, quét QR bằng Google Authenticator.
2. Thêm `ADMIN_TOTP_SECRET` và `ADMIN_SESSION_SECRET` vào `.env.local` **và** Environment Variables trên Vercel, rồi redeploy.
