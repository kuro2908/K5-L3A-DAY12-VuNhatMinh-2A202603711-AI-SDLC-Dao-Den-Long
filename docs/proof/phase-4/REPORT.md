# Bằng chứng phase-4

Sinh tự động bởi `npm run proof` (commit cha: `052c7d1`; chạy lại ở tag `phase-4` phải ra cùng kết quả). Đầu vào từng ca: `cases/`; output thô: `*.jsonl`.

| Yêu cầu | Cách kiểm chứng | Kết quả | Chi tiết |
|---|---|---|---|
| [P1→P3] Thắp đủ đèn KHÔNG còn thắng sớm (luật bị Ticket-03 thay) | r1-no-early-win | ĐẠT | `{"lantern_lit":{"lantern_id":"L1","relight":false},"game_over":0,"end":{"type":"end","ticks":600,"state":"playing","score":150}}` |
| [P1] Bóng Mực chạm: −1 Ngọn Lửa, rơi floor(mang/2) | r2-hit | ĐẠT | `{"type":"event","tick":30,"name":"player_hit","data":{"by":"shade","flames":2,"dropped":2}}` |
| [P1] Tỏa Sáng choáng Bóng Mực ≤ 5 m, tốn 3 đom đóm, choáng 120 tick | r3-pulse | ĐẠT | `{"pulse":{"stunned_ids":["S1"]},"carried":2,"push_x_at_15":8}` |
| [P1] Vùng an toàn: Bóng Mực bị chặn ở mép 6 m | r4-safe (900 snapshot) | ĐẠT | `khoảng cách nhỏ nhất tới đèn = 6.000 (phải ≈ safe_radius 6: bóng áp sát mép nhưng không vào)` |
| [P1] Hết đêm mà chưa thắp hết đèn thì thua (dawn) | r5-dawn | ĐẠT | `{"type":"end","ticks":300,"state":"lost","score":0}` |
| [P1] Tính tất định (Đêm 2, có sinh ngẫu nhiên) | 2 lần seed 99 so từng byte; seed 100 phải khác | ĐẠT | `1796120 byte; shade_spawned=8, Gió Lạc id=D1,D2` |
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
| [P2] Một Đêm đầy đủ (≤ 21.600 tick) headless ≤ 30 s (gồm khởi động tsx) | n11-fullnight | ĐẠT | `2.4 s, kết thúc: {"type":"end","ticks":18000,"state":"lost","score":0}` |
| [P3] Đèn vừa thắp có fuel 100, hao 1.0/giây | d1-fuel | ĐẠT | `fuel@0=100, @60=99, @120=98` |
| [P3] Châm dầu: used = min(mang, ceil((100−fuel)/10)), +10 fuel/đom đóm, +5 điểm/đom đóm | d2-refuel (fuel 55, mang 9) | ĐẠT | `{"event":{"lantern_id":"L1","amount":5,"fuel":100},"carried":4,"score":25}` |
| [P3] Hết dầu → tắt (deposited 0, ever_lit giữ); thắp lại chỉ tốn 5, +40, relight:true | d3-out-relight | ĐẠT | `{"out":30,"lit":{"lantern_id":"L1","relight":true},"score":65,"lantern":{"id":"L1","pos":[0,0,1],"lit":true,"deposited":5,"fuel":100,"ever_lit":true,"relit_count":1}}` |
| [P3] Bóng Mực wander tới đèn yếu (<30), vào ≤ 2 m thì drain: hút 5/s (+1/s hao = 6/s), event fuel_drain mỗi 60 tick | d4-drain | ĐẠT | `{"drain_from_tick":31,"loss_per_s":6,"fuel_drain":{"type":"event","tick":91,"name":"fuel_drain","data":{"lantern_id":"L1","shade_id":"S1","fuel":13.5}}}` |
| [P3] Đúng 30 vẫn còn vùng an toàn, dưới 30 thì mất | d5-low-fuel-zone (fuel 31 → 30 ở tick 60) | ĐẠT | `dist@60=6.000 (fuel 30), khoảng cách nhỏ nhất sau đó=0.93` |
| [P3] Hết giờ: ≥ ceil(0.6n) đèn sáng → won/dawn_survived (+50+⌊fuel⌋ mỗi đèn, +50/Lửa); ít hơn → lost/dawn | d6-dawn-win / d6-dawn-lose (Đêm 1, 3/5 và 2/5) | ĐẠT | `win: {"type":"end","ticks":120,"state":"won","score":594}; lose: {"result":"lost","reason":"dawn"}` |
| [P3] Sức chứa = 10 + 2×lần thắp thành công (tối đa 20) | d7-capacity | ĐẠT | `capacity: 10 → 12 sau 1 lần thắp` |
| [P3] Tỏa Sáng trúng Bóng Mực đang drain: stunned, tổng +15 | d8-pulse-drain | ĐẠT | `state=stunned, score=15` |
| [P4] Soak: 10 Đêm liên tiếp trong một tiến trình, crashes = 0, mem_end ≤ 1.2 × mem_start | scripts/soak.ts --seed 7 --nights 10 | ĐẠT | `{"contract_version":"1.3","nights":10,"crashes":0,"results":["lost","lost","lost","lost","lost","lost","lost","lost","lost","lost"],"mem_start_mb":71.9,"mem_end_mb":77.9,"duration_s":0.4}` |
| [P4] Benchmark (bench.json commit trong repo, đo trên máy tác giả): avg ≥ 60, p1-low ≥ 30, load ≤ 10 s | npm run bench -- --seed 42 --duration 30 --out bench.json (cảnh chuẩn: 200 Bóng Mực + 100 đom đóm) | ĐẠT | `avg=698.5, p1_low=166.3, p95=2.6 ms, frames=20954, load=1678 ms, >100ms=0, GPU=ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F9D) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| [P4] <run_cmd> --export-leaderboard: {entries:[…]} đúng thứ tự (điểm giảm dần; hòa điểm ai đạt trước đứng trên) | scripts/serve.ts --export-leaderboard | ĐẠT | `thứ tự xuất: top_dog > early_tie > late_tie` |
