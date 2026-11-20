# Phase 3 — Change Request "Đèn cạn dầu": ghi chú, test bị thay, đánh giá, nhật ký AI

Quyết định thiết kế: [`docs/adr/0001-lantern-fuel-and-dawn-rule.md`](../adr/0001-lantern-fuel-and-dawn-rule.md). Breaking changes: [`CHANGELOG.md`](../../CHANGELOG.md). Spec: [`docs/spec/phase-3.md`](../spec/phase-3.md).

## Test cũ bị luật mới làm sai — đã sửa hoặc thay (không có test nào bị `skip`)
Chạy lại toàn bộ bộ test sau khi đổi luật: **đúng 7 test đỏ**, đều do ticket, không có hồi quy bất ngờ.

| Test cũ | Vì sao sai | Xử lý |
|---|---|---|
| `snapshot 0 … time_left 300` | Đêm 1 nay 240 s | sửa số (240, rồi 239 ở tick 60) |
| `tạm dừng … 300 − 10/60` | như trên | sửa số |
| `Night 2 data … 330 s`, `Night 3 … 360 s` | Đêm 2/3 nay 270/300 s | sửa số + đổi tên test |
| `cost 10 … +10/mote +100/lantern` | điểm mỗi đom đóm nạp nay +5; `lantern_lit` thêm `relight` | sửa số điểm và dữ liệu sự kiện |
| `nearest unlit lantern wins … lit lanterns ignored` | đèn đang sáng mà chưa đầy dầu nay là đèn **nhận được** (châm dầu), nên không còn bị bỏ qua | đổi thành "nearest lantern wins", đặt đèn sáng ở xa hơn |
| `all lit -> won with bonus floor(sec)*2 + 50*flames` | luật thắng sớm bị bỏ | **xóa** cả nhóm `win / lose` cũ, thay bằng nhóm "survive to dawn" (5 test): không thắng sớm, thắng ở bình minh + công thức điểm, thua dưới ngưỡng, ngưỡng 3/5·4/6·5/7, `no_flames` ở tick cuối ưu tiên hơn bình minh |
| (cùng nhóm) `all lit on the very last tick still wins` | chỉ còn đúng ngẫu nhiên | gộp vào nhóm mới ở trên |

Phần của Phase 1–2 **không** bị thay (di chuyển, lướt, nhảy, rơi, bục nhảy, Gió Lạc, Bùa Gió, gió, tạm dừng, Tỏa Sáng, bị đánh, lịch sinh, tính tất định…) vẫn xanh nguyên vẹn. Test mới: 16 test cho nhiên liệu, hút dầu, ngưỡng 30, điểm và sức chứa (cộng 5 test thay nhóm thắng/thua cũ).

## Giả định mới
| Chủ đề | Giả định |
|---|---|
| Đèn đầy dầu | Chỉ "đầy" (không được chọn) khi fuel đúng 100 ở bước 5; do hao dầu ở bước 2, trên thực tế gần như luôn nhận được ≥ 1 đom đóm (ADR) |
| `fuel_drain` | Phát khi bộ đếm hút của từng con chia hết 60 (60, 120, …) |
| Đèn đặt `lit:true` kèm `ever_lit` | Mặc định `ever_lit = lit` |
| `target_lantern_id` trong scenario | Đèn mà con đó đang nhắm (wander) hoặc đang hút (drain) |
| `per_second_left` | Giữ khóa trong `tuning` với giá trị 0 (bỏ thưởng thời gian) |
| Mù màu | Chỉ ảnh hưởng hiển thị (viền/mắt Bóng Mực, màu cảnh báo, ⚠, đèn tắt xẹp 20% có vết rách, đèn sắp hết dầu nhấp nháy 1 Hz); headless không đổi |

## Đánh giá Phase 3
- Đạt: 63 test + 26 ca proof (`docs/proof/phase-3/REPORT.md`); giao diện: thanh dầu, nhấp nháy, cảnh báo ⚠, sức chứa 16 ô, mù màu lưu qua nạp lại trang đều thấy tận mắt.
- Chưa kiểm chứng: nhấp nháy 1 Hz chỉ kiểm bằng mã + ảnh tĩnh; âm thanh vẫn chưa nghe được; FPS thực vẫn mới là chi phí vẽ.
- Phase 1–2 không hỏng ngoài 7 test do ticket.

## Nhật ký dùng AI
- Cách làm: đọc ticket → liệt kê test bị ảnh hưởng *trước khi code* → sửa sim bằng script thay thế có kiểm tra mỏ neo (thất bại ồn ào thay vì sửa trượt) → chạy test để xác nhận đúng 7 đỏ.
- Lỗi AI: (1) mỏ neo sai trong script làm patch dở dang (settings/index áp dụng, main.ts chưa) — phát hiện nhờ script dừng với lỗi rõ; (2) hai test mới sai hình học (đèn đặt ở x=40 ngoài rìa đảo bán kính 40; kiểm ở tick 70 trong khi vùng an toàn mất từ tick 61) — test đỏ chỉ ra, sửa test; (3) thanh dầu chỉ hiện nền: xoay từng mảng riêng thay vì cả nhóm billboard — phát hiện qua ảnh chụp, không qua test.
- Token/chi phí Phase 3: **bạn điền từ `/cost`**.
