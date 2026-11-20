# AGENTS.md — Đảo Đèn Lồng

Game 3D Three.js + TypeScript. Logic thuần trong `src/sim` (không DOM/three), hiển thị trong `src/render`.

## Lệnh
- Cài + build: `npm ci && npm run build`
- Chơi: `npm run dev` (mở http://localhost:5173)
- Test: `npm test` — phải xanh trước khi kết thúc việc
- Headless: `npx tsx src/headless/cli.ts --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Bằng chứng: `npm run proof -- phase-N` (chạy CLI thật, ghi `docs/proof/phase-N/REPORT.md`)
- Spec + acceptance criteria: `docs/spec/phase-N.md`; ghi chú/giả định: `docs/notes/phase-N.md`

## Quy ước
- **Mọi số cân bằng nằm ở `game.contract.json`** (`tuning`). `sim.ts` đọc thẳng từ đó; không hardcode lại số ở nơi khác.
- Sim không dùng `Math.random`/`Date`; chỉ dùng `mulberry32(seed)`. Cùng seed + scenario + inputs = output giống hệt.
- 60 tick/s cố định. Bước k đọc input tick k, sự kiện ghi `tick = k+1`.
- Thực thể sáng tạo thêm không được đổi output headless (tắt khi headless hoặc chỉ ở render).
- Test cũ bị yêu cầu mới làm sai: sửa kèm lý do trong `docs/notes/`, không xóa im lặng.
- Không commit `.env`/key. Không viết lại lịch sử git sau khi gắn tag.

## Bản đồ & luật
- Hình học: `src/sim/maps.ts` (góc đo từ +X: điểm = (r·cos a, r·sin a) trên (x,z)). Luật + thứ tự 11 bước của tick: `src/sim/sim.ts`.
- Scenario muốn Bóng Mực lao vào thứ gì thì đặt nó **trong tầm đuổi 12 m**.

## Lỗi AI đã gặp (cập nhật khi lặp lại)
- Đếm tick lệch 1 khi gán thời gian choáng trong cùng bước → đã có test "stun wears off".
- Phím tap ngắn bị bỏ qua khi chỉ đọc trạng thái giữ phím → render dùng `latched` cho jump/interact/pulse.
- Test đạt vì lý do sai (bóng ngoài tầm phát hiện nên không bao giờ chạm vùng an toàn) → mỗi test "X không được xảy ra" phải kèm khẳng định chứng minh X đã được thử (ví dụ khoảng cách tối thiểu ≈ bán kính).
- Chrome giới hạn rAF ở cửa sổ nền (~1 FPS): đừng kết luận game chậm; đo bằng `__ddl.renderBench(n)` (render đồng bộ + readPixels).
- y của Bóng Mực trong scenario bị bỏ qua (nó bám mặt đất): muốn test 3D thì đặt Mây ở tầng cao.
