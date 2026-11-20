# Spec Phase 2 (Ticket-02 "Ba hòn đảo", Contract v1.1) — acceptance criteria

Trạng thái kiểm: **T** = có test tự động (`tests/sim.test.ts`), **P** = có ca trong `docs/proof/phase-2/REPORT.md`, **M** = kiểm tay trên trình duyệt, **—** = chưa kiểm chứng.

## Phần 1 — Số liệu chuẩn
| Mục | Tiêu chí nghiệm thu | Kiểm |
|---|---|---|
| Di chuyển | 6.0 m/s; đạt tốc độ đầy đủ trong 6 tick, dừng trong 6 tick; điều khiển trên không giống mặt đất | T |
| Nhảy | Chỉ khi chạm đất; đỉnh ≈ 1.2 m; bấm lúc đang bay bị bỏ qua | T |
| Lướt | 14 m/s trong 12 tick, hồi 90 tick tính từ lúc bắt đầu; giữ độ cao trên không; event `dash` | T, P |
| Đom đóm | Sức chứa 10; nhặt khi XZ ≤ 1.0 và chênh cao ≤ 1.5 (biên đúng 1.0 nhặt, 1.01 không); 20 lúc đầu ở 20 điểm khác nhau; +1 ở tick 240, 480…; trần 30 | T, P |
| Đèn | Chi phí 10, nạp nhiều lần, nhớ tiến độ; bán kính 2.0; chọn đèn chưa sáng gần nhất, hòa thì id nhỏ | T |
| Vùng an toàn | Bóng Mực bị chặn ở mép 6 m (khoảng cách tối thiểu đo được = 6.000); bóng đang ở trong lúc đèn vừa sáng bị đẩy ra ≤ 30 tick, không gây sát thương | T, P |
| Tỏa Sáng | Tốn 3, bán kính 3D 5 m quanh chân+0.8, hồi 180 tick; choáng 120 tick, đẩy 4 m trong 15 tick, dừng ở mép vùng an toàn; làm mới khi trúng lại; +5/lần | T, P |
| Bóng Mực | 4.0 m/s (Đêm 3: 4.5); phát hiện 12 / bỏ đuổi 18; chạm XZ ≤ 1.0 và cao ≤ 1.5; tối đa 1 Lửa/tick; recoil 2 m/60 tick; trạng thái spawning/wander/chase/recoil/stunned | T |
| Bị đánh | −1 Lửa, rơi floor(mang/2) ra vành 1.5–2.5 m (sống 480 tick), bất tử 90 tick | T, P |
| Rơi khỏi đảo | Đúng 1 lần ở Y < −10, bỏ qua bất tử, mất hết đom đóm, chờ 60 tick, hồi sinh tại xuất phát bất tử; hết Lửa thì thua ngay | T, P |
| Thắng/thua | hết Lửa → no_flames (ưu tiên); tất cả đèn sáng → thắng, kể cả tick cuối; hết giờ → dawn | T, P |
| Điểm | +10/đom đóm nạp, +100/đèn, +5/Bóng Mực trúng; thắng: +2×floor(giây còn) +50×Lửa | T |
| Thứ tự tick | Theo 11 bước của ticket (đánh dấu trong `Sim.step`) | đọc mã |

## Phần 2 — Bản đồ
| Đêm | Tiêu chí | Kiểm |
|---|---|---|
| 1 Đảo Bến | R=40, 5 đèn ở toạ độ chuẩn, 24 điểm đom đóm, 12 điểm sinh Bóng Mực (r=37) cách người chơi ≥ 15; 2 con ở giây 5 rồi mỗi 8 s, tối đa 6 | T, P |
| 2 Đảo Cau | 2 đảo R=28 + cầu tre không lan can (rời cầu thì rơi); 2 bục nhảy (vy 14, 24 m/s, ~1.4 s, đáp trong đảo đích, phím không ghi đè); 6 đèn; Bóng Mực mỗi 7 s tối đa 8 | T, P |
| 3 Đảo Chuông | 3 tầng, vách đứng không leo từ dưới lên, bước ra thì rơi xuống tầng dưới; 2 dốc 3 m; bục nhảy (0,3,13) → tầng 2; tháp chuông rắn; 7 đèn đúng độ cao; Bóng Mực mỗi 6 s tối đa 10 | T, P |
| Gió mạnh | Mỗi 30 s một cơn 5 s, hướng ngẫu nhiên theo seed, đẩy 2 m/s, cờ `warning` 2 s trước | T, P |

## Phần 3 — Tính năng mới
| Tính năng | Tiêu chí nghiệm thu | Kiểm |
|---|---|---|
| Gió Lạc | ≤ 2 con, sinh tick 1200, 2400…; idle → chase khi mang ≥ 5 và cách ≤ 15, mất điều kiện thì về idle; chạm XZ ≤ 1.2 cướp min(3, mang), sang flee 240 tick rồi biến mất; Tỏa Sáng trúng khi chase → flee không cướp; trúng khi flee có đồ → `drifter_drop`; không mất Lửa; vùng an toàn không chặn | T, P |
| Bùa Gió | Nhặt như đom đóm; 600 tick; chạy 7.2 m/s; Lướt không hồi chiêu nhưng không lướt chồng; hồi sinh sau 2700 tick; event `charm_picked` | T, P |
| Chuỗi 3 Đêm | Menu → giới thiệu (lời Ông Đăng) → chơi → kết quả → Đêm kế tiếp; thắng Đêm 3 ra Bình Minh + tổng điểm; thua thì chơi lại Đêm đó | M (cả chuỗi chạy qua DOM, tổng 2424) |
| Tạm dừng | Esc/P dừng toàn bộ logic; Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. Headless: `pause` làm `tick` tăng nhưng `sim_tick`, thời gian, hồi chiêu, spawn đứng yên, snapshot `paused` | T, P, M (0 tick trong 2.5 s) |
| Cài đặt | Âm lượng + độ nhạy chuột, lưu giữa các lần mở | M (đặt 25/150, nạp lại trang vẫn giữ) |
| Âm thanh | Nhạc nền + hiệu ứng: nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s (thêm: bùa, bị cướp), tổng hợp bằng WebAudio | — (đã nối sự kiện trong mã; chưa nghe thử được trong môi trường kiểm thử) |
| HUD | Lửa (trái trên), mm:ss giữa (đỏ + nhấp nháy ≤ 30 s), đèn k/n + điểm (phải trên), thanh 10 ô, biểu tượng Lướt/Tỏa Sáng, nhắc "E — Nạp ánh sáng (x/10)", mũi tên tới đèn chưa sáng khi ngoài màn hình | M (ảnh chụp Đêm 3 thấy đủ; nhắc E và nhấp nháy chưa thấy tận mắt) |
| Bảng màu | Hằng số hex trong `src/render/world.ts` (`PAL`) và `index.html`; ánh sáng môi trường = 0.15 + 0.55 × (sáng/tổng) | đọc mã + M (một phần) |

## Contract v1.1
| Mục | Kiểm |
|---|---|
| `--night 1/2/3`; snapshot có `night`, `wind`, player `vel/grounded/invuln/dash_cd_s/pulse_cd_s/charm_s`, mảng `motes` (kind, ttl_s), `drifters`, `charms` | T |
| Scenario: `invuln_ticks`, `dash_cd_ticks`, `pulse_cd_ticks`, `charm_ticks`, `shades[].state/state_ticks_left`, `drifters`, `charms`, `random_drifters`, `wind_enabled` | T |
| Input `dash`, `pause`; sự kiện `dash`, `charm_picked`, `drifter_steal`, `drifter_drop`, `night_start`, `paused`, `resumed`; `player_hit` do rơi có `lost` | T |
| Một Đêm đầy đủ (21.600 tick) ≤ 30 s | T, P (1.5 s) |
| ≥ 30 FPS ở 1280×720 | Chi phí vẽ đo được 1.7–2.1 ms/khung ở 1920×935 trên GTX 1650 (`__ddl.renderBench`). FPS thực chưa đo vì cửa sổ kiểm thử bị Chrome giới hạn rAF |
