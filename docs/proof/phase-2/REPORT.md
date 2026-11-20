# Bằng chứng phase-2

Sinh tự động bởi `npm run proof` (commit cha: `8a02c65`; chạy lại ở tag `phase-2` phải ra cùng kết quả). Đầu vào từng ca: `cases/`; output thô: `*.jsonl`.

| Yêu cầu | Cách kiểm chứng | Kết quả | Chi tiết |
|---|---|---|---|
| [P1] Thắp hết đèn thì thắng | r1-win | ĐẠT | `{"game_over":{"result":"won","reason":"all_lit"},"end":{"type":"end","ticks":1,"state":"won","score":948}}` |
| [P1] Bóng Mực chạm: −1 Ngọn Lửa, rơi floor(mang/2) | r2-hit | ĐẠT | `{"type":"event","tick":30,"name":"player_hit","data":{"by":"shade","flames":2,"dropped":2}}` |
| [P1] Tỏa Sáng choáng Bóng Mực ≤ 5 m, tốn 3 đom đóm, choáng 120 tick | r3-pulse | ĐẠT | `{"pulse":{"stunned_ids":["S1"]},"carried":2,"push_x_at_15":8}` |
| [P1] Vùng an toàn: Bóng Mực bị chặn ở mép 6 m | r4-safe (900 snapshot) | ĐẠT | `khoảng cách nhỏ nhất tới đèn = 6.000 (phải ≈ safe_radius 6: bóng áp sát mép nhưng không vào)` |
| [P1] Hết đêm mà chưa thắp hết đèn thì thua (dawn) | r5-dawn | ĐẠT | `{"type":"end","ticks":300,"state":"lost","score":0}` |
| [P1] Tính tất định (Đêm 2, có sinh ngẫu nhiên) | 2 lần seed 99 so từng byte; seed 100 phải khác | ĐẠT | `1636254 byte; shade_spawned=8, Gió Lạc id=D1,D2` |
| [P1] File inputs sai định dạng → mã thoát 2 | bad-inputs.json | ĐẠT | `exit=2, stderr=error: inputs.frames[1].tick: must strictly increase` |
| [P2] Lướt: 14 m/s, 0.2 s (12 tick), event dash | n1-dash | ĐẠT | `vel@11=14, quãng đường 13 tick=2.90 m, dash_cd_s=1.5` |
| [P2] Rơi khỏi đảo: đúng 1 lần, −1 Lửa, mất hết đom đóm, chờ 60 tick, hồi sinh bất tử | n2-fall | ĐẠT | `{"hit":{"by":"fall","flames":2,"dropped":0,"lost":7},"respawn_tick":127,"respawn_pos":[0,0,0],"invuln":true}` |
| [P2] Bục nhảy (Đêm 2): bay ~1.4 s, đáp trong đảo đích, bỏ qua phím hướng | n3-pad | ĐẠT | `{"air_ticks":83,"landed_at":[51.237,0,6.271],"tick":84}` |
| [P2] Gió Lạc: chase khi mang ≥ 5, cướp min(3, mang), flee, không mất Lửa | n4-drifter | ĐẠT | `{"type":"event","tick":42,"name":"drifter_steal","data":{"drifter_id":"D1","amount":3,"carried":5}}` |
| [P2] Tỏa Sáng trúng Gió Lạc đang mang đồ → thả lại (drifter_drop) | n5-drifter-drop | ĐẠT | `{"drifter_id":"D1","amount":3}` |
| [P2] Bùa Gió: 600 tick, chạy 7.2 m/s, hồi sinh sau 2700 tick | n6-charm | ĐẠT | `{"event":{"charm_id":"C1","charm_ticks":600},"vel":7.2,"respawn_s":45}` |
| [P2] Gió mạnh (Đêm 3): báo trước 2 s, đẩy 2 m/s | n7-wind | ĐẠT | `{"warning_at_1700":true,"wind":{"active":true,"dir_deg":225,"warning":false},"pushed_1s":[-1.414,-1.414]}` |
| [P2] Bục nhảy (Đêm 3) đưa Mây lên tầng 2 (Y = 6) | n8-bellpad | ĐẠT | `[0,6,6]` |
| [P2] Tạm dừng: tick tăng, sim_tick/vị trí/thời gian đứng yên; paused/resumed | n9-pause | ĐẠT | `{"at12":{"state":"paused","sim_tick":10},"at21":{"state":"playing","sim_tick":11}}` |
| [P2] Lịch sinh: 20 đom đóm lúc đầu +1 mỗi 240 tick; Bóng Mực 2 con tick 300, +1 mỗi 480 | n10-schedule | ĐẠT | `shade_spawned=300:S1 300:S2 780:S3 1260:S4, motes@0=20, @240=21` |
| [P2] Một Đêm đầy đủ (≤ 21.600 tick) headless ≤ 30 s (gồm khởi động tsx) | n11-fullnight | ĐẠT | `1.7 s, kết thúc: {"type":"end","ticks":21600,"state":"lost","score":0}` |
