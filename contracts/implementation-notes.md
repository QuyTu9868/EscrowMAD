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
