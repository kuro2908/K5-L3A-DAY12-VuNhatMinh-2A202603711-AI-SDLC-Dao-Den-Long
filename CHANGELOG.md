# Changelog

## Phase 3 — "Đèn cạn dầu" (tag `phase-3`, Contract v1.2)
Change Request thay luật cốt lõi. Quyết định thiết kế: [ADR-0001](docs/adr/0001-lantern-fuel-and-dawn-rule.md). Test bị thay: [docs/notes/phase-3.md](docs/notes/phase-3.md).

### Breaking changes
- **Luật thắng thay hoàn toàn:** thắp đủ đèn không còn kết thúc Đêm. Thắng = còn sống ở bình minh và số đèn sáng ≥ ceil(0.6·n) (3/5, 4/6, 5/7). `game_over.reason`: `dawn_survived` / `dawn` / `no_flames`; `all_lit` không còn dùng.
- **Thời lượng Đêm:** 300/330/360 s → 240/270/300 s.
- **Đèn đã sáng nhận thêm đom đóm** (trước đây thì không) và hao dầu; hết dầu thì tắt. Mô hình trạng thái đèn: thêm `fuel`, `ever_lit`, `relit_count`.
- **Vùng an toàn** mất khi fuel < 30 (trước đây vĩnh viễn khi đèn đã sáng). Bóng Mực có trạng thái mới `drain`.
- **Điểm:** thay toàn bộ công thức (+5/đom đóm nạp, +100 thắp lần đầu, +40 thắp lại, +50+⌊fuel⌋ mỗi đèn sáng và +50/Lửa ở bình minh; bỏ thưởng thời gian).
- **Sức chứa** không còn cố định 10: 10 + 2×lần thắp thành công, tối đa 20.
- **Contract v1.2:** snapshot (đèn: `fuel, ever_lit, relit_count`; player: `capacity`), scenario (`fuel, ever_lit, successful_lights, target_lantern_id`), sự kiện (`refuel, lantern_out, fuel_drain`, `lantern_lit.relight`), tuning (8 khóa mới).

### Thêm
- Thắp lại đèn tắt chỉ tốn 5 đom đóm. Chế độ "Bảng màu dễ phân biệt" (lưu được). Thanh dầu, nhấp nháy 1 Hz khi fuel < 30, đèn tắt xẹp 20% có vết rách, tia hút dầu của Bóng Mực.

## Phase 2 — "Ba hòn đảo" (tag `phase-2`, Contract v1.1)
- **Breaking:** toàn bộ `tuning` thay bằng số chuẩn (sức chứa 10, đèn 10 đom đóm, an toàn 6 m, Bóng Mực 4 m/s…); `fall_enabled` thành `true`.
- **Breaking:** điểm tính khi nạp đom đóm (không phải khi nhặt); đèn +100; Tỏa Sáng +5/con.
- Thêm Đêm 2 (Đảo Cau) và Đêm 3 (Đảo Chuông); `--night 1|2|3`.
- Thêm Lướt, rơi khỏi đảo, bục nhảy, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng; trạng thái Bóng Mực spawning/wander/chase/recoil/stunned.
- Snapshot/scenario/input/sự kiện mở rộng theo v1.1.
- Giao diện: menu, giới thiệu Đêm, tạm dừng, cài đặt (lưu), kết quả, Bình Minh, HUD đầy đủ, âm thanh WebAudio.

## Phase 1 — Đêm 1 (tag `phase-1`, Contract v1.0)
- Lõi mô phỏng tất định, CLI headless, game 3D chơi được một Đêm.
