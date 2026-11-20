# Changelog

## Phase 2 — "Ba hòn đảo" (tag `phase-2`, Contract v1.1)
- **Breaking:** toàn bộ `tuning` thay bằng số chuẩn (sức chứa 10, đèn 10 đom đóm, an toàn 6 m, Bóng Mực 4 m/s…); `fall_enabled` thành `true`.
- **Breaking:** điểm tính khi nạp đom đóm (không phải khi nhặt); đèn +100; Tỏa Sáng +5/con.
- Thêm Đêm 2 (Đảo Cau) và Đêm 3 (Đảo Chuông); `--night 1|2|3`.
- Thêm Lướt, rơi khỏi đảo, bục nhảy, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng; trạng thái Bóng Mực spawning/wander/chase/recoil/stunned.
- Snapshot/scenario/input/sự kiện mở rộng theo v1.1.
- Giao diện: menu, giới thiệu Đêm, tạm dừng, cài đặt (lưu), kết quả, Bình Minh, HUD đầy đủ, âm thanh WebAudio.

## Phase 1 — Đêm 1 (tag `phase-1`, Contract v1.0)
- Lõi mô phỏng tất định, CLI headless, game 3D chơi được một Đêm.
