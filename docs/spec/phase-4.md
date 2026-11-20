# Spec Phase 4 (Ticket-04 "Bình minh: phát hành v1.0.0", Contract v1.3) — acceptance criteria

Ký hiệu: **T** test tự động (`tests/`), **P** ca proof (`docs/proof/phase-4/REPORT.md`), **M** kiểm tay trên trình duyệt, **R** đọc mã, **—** chưa làm/chưa kiểm chứng.

| Mục | Tiêu chí nghiệm thu | Kiểm |
|---|---|---|
| 1 Benchmark: lệnh | `bench_cmd --seed 42 --duration 30 --out bench.json` chạy, tự thoát mã 0 | P (bench.json commit) |
| 1 Benchmark: cảnh | Cửa sổ 1280×720 không toàn màn hình, vsync/giới hạn khung tắt; Đêm 1 đủ hiệu ứng; đúng 200 Bóng Mực `wander` rải theo seed 42, đúng 100 đom đóm, L1–L3 sáng fuel 100; tắt: sinh thêm, sát thương, nhặt, hao dầu, kết thúc Đêm; Mây đứng yên (0,0,0); camera bay vòng r=30, y=15, ngược chiều kim đồng hồ, 15 s/vòng, từ (30,15,0); 3 s khởi động không đo | R, T (cờ `bench` của sim), M (ảnh chụp cảnh) |
| 1 Benchmark: đầu ra | `contract_version 1.3`, `avg_fps`, `p1_low_fps` (k = max(1, ⌈1%N⌉) khung dài nhất), `frame_ms_p95`, `frames`, `load_ms` (từ lúc tiến trình bắt đầu), `peak_mem_mb`, `vsync_off`, `renderer`, `os` | P |
| 1 Benchmark: ngưỡng | avg ≥ 60, p1-low ≥ 30, load ≤ 10 000 ms **trên máy chấm** | P chỉ chứng minh trên máy tác giả (avg 698, p1-low 166, load 1.7 s); máy chấm chưa biết |
| 1 `peak_mem_mb` | Bản web không đo được RSS của trình duyệt → `null` kèm giải thích (`peak_mem_note`), thêm `js_heap_peak_mb` | P |
| 2 Soak | `soak_cmd --seed 7 --nights 10 --out soak.json`: 10 Đêm xoay 1→2→3, Đêm i seed 7+i, đầu vào ngẫu nhiên đúng tỉ lệ (đổi hướng mỗi 30 tick; 5% nhảy, 3% lướt, 2% tỏa sáng, 10% tương tác); crashes = 0 và mem_end ≤ 1.2×mem_start | T, P (0 lỗi; 71.5 → 77.5 MB) |
| 3 Bảng xếp hạng | Nhập tên sau Bình Minh hoặc sau khi thua; tên 3–12 ký tự `[A-Za-z0-9_]` (+ chữ Việt có dấu); lưu `name, score, nights_won, achieved_at (ISO 8601 + múi giờ), seed`; top 10; điểm giảm dần, hòa điểm ai trước đứng trên; còn sau khi mở lại; màn hình từ menu | T (quy tắc, server, khởi động lại), M (luồng UI + file trên đĩa) |
| 3 Xuất | `<run_cmd> --export-leaderboard out.json` → `{"entries":[…]}` đúng thứ tự | T, P |
| 4 Đổi phím | Mọi hành động (4 hướng, nhảy, lướt, tương tác, tỏa sáng, tạm dừng); báo trùng phím; "Khôi phục mặc định"; lưu | T, M |
| 4 Phụ đề / chỉ báo | Bóng Mực xuất hiện (chú thích + mũi tên ở mép màn hình), gió sắp thổi, 10 s cuối (số lớn giữa màn hình), đèn fuel < 30 (cảnh báo + nhấp nháy), sự kiện chính (thắp/tắt đèn, bị đánh, bị cướp…) | M một phần (cảnh báo hút dầu/sắp hết dầu thấy trong ảnh); mũi tên Bóng Mực xuất hiện và đếm ngược 10 s: R |
| 4 Giảm chuyển động | Tắt rung camera và chớp màn hình (cũng tắt nhấp nháy đồng hồ) | R, M (bật/tắt lớp `rm`; chưa so sánh được rung bằng mắt) |
| 4 Cỡ chữ | ≥ 18 px ở 1280×720; tùy chọn chữ lớn ×1.25 | M (đo `getComputedStyle`: 18 px / 22.5 px) |
| 5 Đóng gói | Clone sạch → ≤ 3 lệnh → chơi được | M (xem `docs/notes/phase-4.md`: thử trên bản clone sạch) |
| 5 Tài liệu | README (mô tả, ảnh chụp, yêu cầu, cài đặt, điều khiển, test, headless, bench, soak); CHANGELOG đủ 4 phase; CREDITS; LICENSE | R |
| 5 Release | GitHub Release `v1.0.0` có bản chạy được | **— chưa tạo** (cần `gh`/token của chủ repo; xem ghi chú) |
| 6 Contract v1.3 | `contract_version "1.3"`, `bench_cmd`, `soak_cmd`; mọi yêu cầu v1.0–v1.2 còn nguyên | T |
| 7 Retro | 1–2 trang tổng hợp 4 phase | `docs/retro.md` (token/chi phí do chủ repo điền) |
| 7 Video | `.mp4` < 5 phút | **— chưa quay** (việc của chủ repo) |
