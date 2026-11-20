# Bằng chứng Phase 1

Sinh tự động bởi `npm run proof` ở commit `507f392` (chạy lại ở tag `phase-1` phải ra cùng kết quả). Output thô: các file `*.jsonl` cùng thư mục.

| Yêu cầu | Cách kiểm chứng | Kết quả | Chi tiết |
|---|---|---|---|
| Thắp hết đèn thì thắng | win.scenario + win.inputs | ĐẠT | `{"lantern_lit":{"lantern_id":"L1"},"game_over":{"result":"won","reason":"all_lit"},"end":{"type":"end","ticks":1,"state":"won","score":1098}}` |
| Bóng Mực chạm thì mất máu (và rơi một phần đom đóm) | hit.scenario | ĐẠT | `{"type":"event","tick":66,"name":"player_hit","data":{"by":"shade","flames":2,"dropped":2}}` |
| Tỏa sáng xua/choáng Bóng Mực trong bán kính, tốn ánh sáng | pulse.scenario + pulse.inputs | ĐẠT | `{"pulse":{"stunned_ids":["S1"]},"carried":1,"S1":{"id":"S1","pos":[9,1,0],"state":"stunned"},"S2":{"id":"S2","pos":[19.942,1,0],"state":"chase"}}` |
| Bóng Mực sợ đèn: không vào bán kính an toàn quanh đèn đã thắp | safe.scenario (900 snapshot) | ĐẠT | `khoảng cách nhỏ nhất tới đèn = 8.000 (safe_radius 8), player_hit = 0` |
| Hết đêm mà chưa thắp hết đèn thì thua (dawn) | dawn.scenario (5 s) | ĐẠT | `{"type":"end","ticks":300,"state":"lost","score":0}` |
| Tính tất định: cùng seed → output giống hệt | 2 lần chạy seed 99 so từng byte; seed 100 phải khác | ĐẠT | `381001 byte, shade_spawned = 2` |
| File inputs sai định dạng → mã thoát 2 | tick trùng nhau | ĐẠT | `exit=2, stderr=error: inputs.frames[1].tick: must strictly increase` |
