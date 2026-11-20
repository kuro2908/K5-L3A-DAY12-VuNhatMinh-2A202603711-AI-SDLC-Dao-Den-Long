# AGENTS.md — Đảo Đèn Lồng

Game 3D Three.js + TypeScript. Logic thuần trong `src/sim` (không DOM/three), hiển thị trong `src/render`.

## Lệnh
- Cài + build: `npm ci && npm run build`
- Chơi: `npm run dev` (mở http://localhost:5173)
- Test: `npm test` — phải xanh trước khi kết thúc việc
- Headless: `npx tsx src/headless/cli.ts --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Bằng chứng: `npm run proof` (ghi `docs/proof/phase-N/`)

## Quy ước
- **Mọi số cân bằng nằm ở `game.contract.json`** (`tuning`). `sim.ts` đọc thẳng từ đó; không hardcode lại số ở nơi khác.
- Sim không dùng `Math.random`/`Date`; chỉ dùng `mulberry32(seed)`. Cùng seed + scenario + inputs = output giống hệt.
- 60 tick/s cố định. Bước k đọc input tick k, sự kiện ghi `tick = k+1`.
- Thực thể sáng tạo thêm không được đổi output headless (tắt khi headless hoặc chỉ ở render).
- Test cũ bị yêu cầu mới làm sai: sửa kèm lý do trong `docs/notes/`, không xóa im lặng.
- Không commit `.env`/key. Không viết lại lịch sử git sau khi gắn tag.

## Lỗi AI đã gặp (cập nhật khi lặp lại)
- Đếm tick lệch 1 khi gán thời gian choáng trong cùng bước → đã có test "stun wears off".
- Phím tap ngắn bị bỏ qua khi chỉ đọc trạng thái giữ phím → render dùng `latched` cho jump/interact/pulse.
