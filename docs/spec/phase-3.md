# Spec Phase 3 (Ticket-03 "Đèn cạn dầu", Contract v1.2) — acceptance criteria

Ký hiệu: **T** test tự động, **P** ca proof (`docs/proof/phase-3/REPORT.md`), **M** kiểm tay trên trình duyệt, **—** chưa kiểm chứng.

| Mục | Tiêu chí nghiệm thu | Kiểm |
|---|---|---|
| 1 Nhiên liệu | Đèn vừa thắp fuel=100; hao 1.0/s (1/60 mỗi tick, tính bằng số nguyên); snapshot fuel 1 chữ số thập phân, đèn tắt fuel 0 | T, P |
| 1 Châm dầu | Bấm E ở đèn sáng: used=min(mang, ceil((100−fuel)/10)); fuel=min(100, fuel+10·used); trừ used đom đóm; event `refuel {lantern_id, amount, fuel}`; +5/đom đóm | T, P |
| 1 Chọn đèn | Chỉ đèn nhận được (chưa sáng, hoặc sáng chưa đầy); gần nhất, hòa thì id nhỏ | T |
| 1 Hết dầu | fuel ≤ 0 → tắt, deposited=0, `lantern_out`, `ever_lit` giữ; ánh sáng môi trường giảm theo | T, P, M |
| 1 Thắp lại | Đèn từng sáng chỉ cần 5 đom đóm (+40 điểm, `relight:true`); đèn mới cần 10 (+100) | T, P |
| 1 Hiển thị | Thanh dầu trên đèn sáng; fuel<30 thì đèn và thanh nhấp nháy 1 Hz | M (thanh dầu và cảnh báo thấy trong ảnh; nhấp nháy: chỉ kiểm bằng mã) |
| 2 Vùng an toàn | Mất khi fuel<30; đúng 30 vẫn còn (`safeOn`) | T, P |
| 2 Hút dầu | Chỉ `wander` chọn đèn sáng fuel<30 gần nhất (hòa → id nhỏ), nếu không thì đèn tắt gần nhất; ≤ 2 m → `drain` đứng yên, hút 5/s cộng dồn; `fuel_drain` mỗi 60 tick | T, P |
| 2 Thoát drain | → chase nếu Mây trong 6 m; → stunned khi trúng Tỏa Sáng (+15 tổng); → wander nếu đèn tắt, fuel ≥ 30 hoặc cách > 2 m; hết choáng về wander | T, P |
| 2 Châm vượt 30 | Bóng trong vùng 6 m bị đẩy ra ≤ 30 tick, không sát thương | T |
| 3 Thắng | Thời gian 240/270/300 s; thắng khi còn sống ở bình minh và đèn sáng ≥ ceil(0.6n) (3/5, 4/6, 5/7), reason `dawn_survived`; thắp đủ đèn không kết thúc | T, P |
| 3 Thua | Hết Lửa (kể cả tick cuối, ưu tiên) → `no_flames`; hết giờ dưới ngưỡng → `dawn` | T, P |
| 4 Sức chứa | 10 + 2×lần thắp thành công (kể cả thắp lại), tối đa 20; scenario không tính; reset mỗi Đêm; HUD "mang/sức chứa" | T, P, M |
| 5 Điểm | +5/đom đóm nạp (thắp mới, thắp lại, châm dầu); +100 lần đầu; +40 thắp lại; Tỏa Sáng +5 (+15 nếu đang drain); bình minh: mỗi đèn sáng +50+⌊fuel⌋, mỗi Lửa +50; bỏ thưởng thời gian | T, P |
| 6 Mù màu | Cài đặt "Bảng màu dễ phân biệt" được lưu; viền/mắt Bóng Mực #00B3FF; cảnh báo UI #FFFFFF + ⚠; đèn tắt xẹp 20% + vết rách | M (bật, lưu, nạp lại trang vẫn giữ; ⚠ và màu trắng thấy trong ảnh) |
| 7 Contract v1.2 | `contract_version 1.2`; tuning thêm `fuel_max, fuel_decay_per_s, fuel_per_mote, relight_cost, win_ratio, drain_per_s, low_fuel_threshold, capacity_max`; snapshot đèn có `fuel, ever_lit, relit_count`, player có `capacity`; scenario `fuel, ever_lit, successful_lights, target_lantern_id`; `lantern_lit.relight`; `game_over.reason` `dawn_survived` | T |
