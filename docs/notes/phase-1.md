# Phase 1 — giả định, đánh giá, nhật ký AI

## Giả định (chỗ PRD-0 để mơ hồ)
| Chủ đề | Giả định | Khai ở contract |
|---|---|---|
| "Ánh sáng" tốn khi tỏa sáng | Tỏa sáng tiêu `pulse_cost` = 2 đom đóm **đang mang** (không đủ thì không tỏa được) | `pulse_cost` |
| "Máu" | `flames` (3 ngọn lửa); chạm Bóng Mực −1, miễn nhiễm 1.5 s | `flames`, `invuln_s` |
| Rơi đom đóm khi bị chạm | Rơi `floor(carried × 0.5)`, hiện lại quanh Mây cách 2.2 m | `hit_drop_ratio` |
| "Bóng Mực sợ đèn" | Không vào được bán kính 8 m quanh đèn **đã thắp** (đèn chưa thắp không có hiệu lực) | `safe_radius` |
| Xua | Choáng 3 s + đẩy lùi 4 m trong bán kính 7 m, hồi 3 s | `pulse_*` |
| Rơi khỏi đảo | Không có; rìa đảo (bán kính 80 m) là bức tường | `fall_enabled: false` |
| Thắp đèn | Đứng trong 3 m, nhấn tương tác: nạp `min(carried, 6 − đã nạp)`; đủ 6 thì sáng | `lantern_cost`, `interact_radius` |
| Điểm | 10/đom đóm, 200/đèn, 25/lần choáng (con chưa choáng), thắng: +2/giây còn lại +100/lửa còn | `score.*` |
| Thua | hết lửa (`no_flames`) hoặc hết 300 s (`dawn`) | `night1_duration_s` |
| Spawn ngẫu nhiên | 20 đom đóm đầu, +1 mỗi 2 s tới tối đa 30; Bóng Mực đầu tiên ở 20 s, +1 mỗi 15 s, tối đa 4, xuất hiện cách người chơi ≥ 25 m | (nội bộ) |
| Đèn mặc định | L1 (0,0,25), L2 (32,0,8), L3 (18,0,-30), L4 (-26,0,-22), L5 (-34,0,14) | `lantern_count_night1` |
| Trạng thái Bóng Mực | `chase`, `stunned` | — |
| Snapshot cuối | Chỉ phát snapshot ở bội của `--snapshot-every`; thông tin cuối nằm ở dòng `end` | — |

## Đánh giá Phase 1
- Đạt: toàn bộ 7 mục trong `docs/proof/phase-1/REPORT.md`, 21 test đơn vị/CLI xanh.
- Chưa có: âm thanh; cây/đá chỉ là trang trí, không cản đường (không ảnh hưởng contract); `dash` được nhận trong file inputs nhưng game không có dash.
- Chưa kiểm chứng tự động: phần hiển thị 3D (đã chạy thật trên Chrome: HUD, di chuyển 70 tick = 7.0 m, không có lỗi console).

## Nhật ký dùng AI
- Công cụ: Claude Code (Claude Sonnet 5.5). Quy trình: đọc PRD-0 → giả định (bảng trên) → viết test/scenario cùng lõi sim → làm render sau.
- Lỗi AI phát hiện: (1) choáng ngắn 1 tick do trừ ngay trong bước xung → test "stun wears off" bắt được, sửa ở `sim.ts`; (2) một dòng rơi đom đóm viết rối → tự đọc lại và dọn.
- Token/chi phí Phase 1: **cần điền từ `/cost` của bạn** (không có số đo thật trong repo, không bịa). Cách tiết kiệm: tách sim khỏi render để test rẻ, không dùng subagent, chỉ chụp màn hình khi cần.
