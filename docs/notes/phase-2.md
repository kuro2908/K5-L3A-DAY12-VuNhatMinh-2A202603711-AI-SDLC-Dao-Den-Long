# Phase 2 — giả định, thay đổi so với Phase 1, đánh giá, nhật ký AI

## Số chuẩn thay giá trị tự chọn của Phase 1 (test Phase 1 phải đổi số, không bị bỏ)
Mọi hằng số trong `game.contract.json` nay lấy theo Ticket-02. Test Phase 1 cũ dùng số cũ (sức chứa 6, đèn 6 đom đóm, bán kính nhặt 1.5, an toàn 8 m, tốc độ 3.5…) nên được viết lại bằng số chuẩn trong `tests/sim.test.ts`. **Hành vi** Phase 1 (thắng/thua, chạm, tỏa sáng, vùng an toàn, tất định, mã thoát 2) vẫn được kiểm ở nhóm `[P1]` của proof. Hai thay đổi hành vi do ticket: điểm tính khi **nạp** đom đóm (không phải khi nhặt); thắng cộng `floor(giây)×2 + 50×Lửa`.

## Giả định mới (ticket chưa nói)
| Chủ đề | Giả định |
|---|---|
| Vị trí xuất phát Đêm 3 | (0,0,−15): tâm đảo nằm trong trụ tầng 2/tháp nên không đứng được |
| wander | Bóng Mực đi về đèn **chưa sáng** gần nhất (Ticket-03 gọi đó là "như trước"); gần hơn 0.5 m thì đứng yên |
| y của Bóng Mực trong scenario | Bỏ qua; bóng đứng trên mặt đất cao nhất ≤ y+0.5, `pos.y = mặt đất + 1` |
| Chiều cao khi chạm/nhặt | `P.y − mặt đất của thực thể` |
| Đếm tick bất tử | Đặt 90 khi bị đánh → bất tử 90 tick kế tiếp; choáng đặt trong bước Tỏa Sáng nên đứng yên đúng 120 tick tính từ tick xung |
| `snapshot.player.invuln` | boolean (kèm `invuln_s` là số giây) |
| Điểm sinh đom đóm | Chọn ngẫu nhiên theo seed 20 trong 24/24/30 điểm; sinh thêm chọn ngẫu nhiên trong điểm trống; đom đóm rơi tính vào trần 30 |
| `night_start` | Phát ở tick 0 ngay sau snapshot 0 |
| Gió Lạc idle | Trôi 2 m/s theo hướng ngẫu nhiên đổi mỗi 120 tick; sinh trên vòng ngoài đảo |
| Sinh Bóng Mực | Cách người chơi ≥ 15 m, ngoài vùng an toàn đèn đã sáng; trạng thái `spawning` kéo dài 1 tick |
| Bóng sau recoil/choáng | Về `wander`, tick sau tự chuyển `chase` nếu Mây trong 12 m |
| Gió Lạc bị Tỏa Sáng khi đã cướp | Tiếp tục bay, biến mất sau tối đa 120 tick; đom đóm thả thành dạng `dropped` |
| `end.state` khi đang tạm dừng | `playing` |

## Đánh giá Phase 2
- Đạt: 44 test + 18 ca proof (`docs/proof/phase-2/REPORT.md`), luồng 3 Đêm chạy được qua giao diện.
- Chưa kiểm chứng: âm thanh (chưa nghe được), FPS thực ≥ 30 (mới có chi phí vẽ), nhấp nháy/nhắc E trên HUD.
- Chưa làm: chế độ mù màu (Phase 3), đổi phím (Phase 4).

## Nhật ký dùng AI
- Công cụ: Claude Code (Sonnet 5.5). Cách làm: đọc ticket → đặt số vào contract → viết lại sim → viết test theo từng dòng ticket → làm render sau.
- Lỗi AI phát hiện và cách phát hiện:
  1. **Test đạt vì lý do sai**: ca "vùng an toàn" đặt Bóng Mực ngoài tầm phát hiện nên nó không hề lao vào vùng; phát hiện vì proof in khoảng cách nhỏ nhất 24.7 m thay vì ≈ 6. Sửa: đặt trong tầm 12 m và thêm khẳng định "min < 6.1".
  2. Nhiều test viết sai hình học (bóng bắt đầu trong vùng an toàn, y scenario bị bỏ qua, Gió Lạc cách tâm xung 5.05 m): bắt được vì test đỏ; sửa test có lý do hình học, không sửa sim cho khớp.
  3. Đèn điểm thật cho 7 đèn làm cảnh nặng và biên dịch lại shader; đo bằng `renderBench` rồi thay bằng sprite phát sáng.
  4. Tưởng game chậm vì thấy 1 FPS: thực ra Chrome giới hạn rAF của cửa sổ nền; đo đồng bộ mới đúng (ghi vào AGENTS.md).
- Token/chi phí Phase 2: **bạn điền từ `/cost`** (repo không có số đo thật).
