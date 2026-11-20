# Phase 4 — ghi chú, giả định, đánh giá, nhật ký AI

Spec: [`docs/spec/phase-4.md`](../spec/phase-4.md). Retro tổng: [`docs/retro.md`](../retro.md).

## Giả định
| Chủ đề | Giả định |
|---|---|
| `bench_cmd` / web | Game là bản web nên benchmark mở Chrome thật (puppeteer-core + trình duyệt sẵn có, không tải Chromium), cửa sổ hiển thị; `--headless` có sẵn cho máy không màn hình. Ghi `vsync_off: true` vì dùng cờ `--disable-gpu-vsync --disable-frame-rate-limit` (số khung vượt tần số quét màn hình là bằng chứng đã tắt) |
| `load_ms` | Từ lúc script `bench` bắt đầu (gồm khởi động server + mở trình duyệt) đến khung hình đầu tiên của cảnh bench |
| Góc camera bench | Dùng cùng quy ước góc của ticket Phase 2: điểm (r·cos a, r·sin a) trên (x, z); a = 2π·t/15 tính từ lúc nạp cảnh (gồm 3 s khởi động) |
| Đầu vào soak | Hướng mới mỗi 30 tick là góc ngẫu nhiên đều; nhảy/lướt/tỏa sáng/tương tác là cờ bật ngẫu nhiên ở từng tick (cạnh lên xảy ra khi bật sau một tick tắt) |
| Kết quả soak | Đêm hết `--ticks` chuẩn mà vẫn `playing` coi như `lost`; kết quả đều là `lost` vì đầu vào ngẫu nhiên không thắp đủ đèn (đúng kỳ vọng) |
| `run_cmd` | `npx tsx scripts/serve.ts` (server tĩnh + API bảng xếp hạng), để `<run_cmd> --export-leaderboard out.json` hoạt động khi nối chuỗi (npm sẽ nuốt cờ nếu dùng `npm start`) |
| Nơi lưu bảng xếp hạng | `data/leaderboard.json` (đổi bằng `LEADERBOARD_FILE`); khi mở bản tĩnh không có server thì dùng `localStorage` làm dự phòng (chỉ trong trình duyệt đó) |
| Tên tiếng Việt | Chấp nhận mọi chữ Latin (có dấu), chuẩn hóa NFC |

## Đo hiệu năng — lần đầu KHÔNG đạt, rồi sửa
Lần chạy benchmark đầu tiên (cảnh 200 Bóng Mực): **avg 46 fps, p1-low 10 fps** (dưới ngưỡng 60/30). Nguyên nhân tìm được bằng số liệu:
1. ~970 draw call và ~800 vật liệu riêng lẻ (mỗi Bóng Mực/cây có hình học + vật liệu riêng) → chuyển sang `InstancedMesh` (Bóng Mực, cây), `Points` (đom đóm), một `LineSegments` cho mọi tia hút dầu: còn 61 draw call.
2. avg đã ~66 fps nhưng p1-low vẫn 1.4 fps (khung dài hàng trăm ms): sim sao chép + sắp xếp lại danh sách Bóng Mực/đèn nhiều lần mỗi tick (mỗi con 2 lần) → rác GC. Thêm `frame_ms_max`/`frames_over_100ms` vào kết quả để thấy rõ rồi bỏ các lần sắp xếp thừa (`shadesById()` trả về chính mảng nếu đã đúng thứ tự). Hành vi giữ nguyên (63 test cũ vẫn xanh, kiểm tra tất định vẫn đạt).
Kết quả sau sửa (3 lần chạy 10–30 s): avg 526–698 fps, p1-low 137–167 fps, p95 ≈ 3 ms, 0 khung > 100 ms.
Phát hiện thêm lúc chụp ảnh: thân Bóng Mực đang phát sáng tím (sai bảng màu #120A1A) → bỏ phát sáng; ô "mang/sức chứa" bị che bởi nút hồi chiêu → dời vị trí.

## Thử trên bản clone sạch
Xem mục "Kiểm tra clone sạch" bên dưới (điền sau khi chạy).

## Đánh giá Phase 4
- Đạt: bench + soak (số đo thật, commit), bảng xếp hạng lưu đĩa + xuất, đổi phím, chỉ báo hình ảnh, giảm chuyển động, chữ lớn, mù màu; 78 test + 29 ca proof xanh; Phase 1–3 không hỏng.
- **Chưa làm / chưa kiểm chứng:** GitHub Release `v1.0.0` và video demo (việc của chủ repo — không có `gh`/token); ngưỡng hiệu năng trên **máy chấm** (chỉ có số đo máy tác giả); âm thanh chưa nghe thử; rung camera/nhấp nháy chỉ kiểm bằng mã; `peak_mem_mb` là `null` (web).
- Giới hạn đã biết: thứ tự `sort` ổn định nên kết quả headless không đổi, nhưng sim vẫn chạy `Array.find` trên đèn cho mỗi con Bóng Mực mỗi tick (đủ nhanh: 200 con vẫn > 500 fps).

## Nhật ký dùng AI
- Lỗi AI ở Phase 4: (1) cho rằng benchmark đạt trước khi đo → số đo đầu tiên bác bỏ; (2) tự viết cơ chế "nhận biết chạy trực tiếp" cho server quá hack → thay bằng tách thư viện + CLI; (3) `await` ở mức cao nhất trong script chạy CommonJS → bọc async; (4) vi phạm bảng màu (thân Bóng Mực phát sáng) → thấy qua ảnh chụp, không qua test.
- Token/chi phí Phase 4: **chủ repo điền từ `/cost`**.

## Kiểm tra clone sạch
`git clone` repo local sang thư mục tạm mới (commit `7e4a2b4`, Windows 11, Node 24) rồi chỉ làm theo README:
- `npm ci` — 15 s, sạch.
- `npm run build` — qua kiểu + đóng gói.
- `npx tsx src/headless/cli.ts --seed 1 --night 3 --ticks 600 --out smoke.jsonl` — chạy, dòng `end` đúng.
- `npx vitest run` — **78/78 test** (2 file) đạt.
- `npx tsx scripts/serve.ts --port 4999` — `GET /` = 200, `GET /api/leaderboard` = `{"entries":[]}`.
Chưa thử trên máy khác/macOS/Linux (chỉ có máy Windows này).
