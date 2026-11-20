# Đảo Đèn Lồng

> Video demo: _(sẽ thêm ở Phase 4 — Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js + TypeScript). Bạn là **Mây**, người giữ đèn nhỏ tuổi: gom đom đóm, thắp lại các Đèn Lồng Lớn trên 3 hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông), né **Bóng Mực** và **Gió Lạc**, hoặc tỏa sáng để xua chúng. Thắp hết đèn thì thắng Đêm; hết Ngọn Lửa hoặc hết giờ thì thua.

## Chạy (tối đa 3 lệnh)
```bash
npm ci
npm run build      # kiểm tra kiểu + đóng gói vào dist/
npm run dev        # mở http://localhost:5173
```

## Điều khiển
| Phím | Việc |
|---|---|
| W A S D / mũi tên | Di chuyển (theo hướng camera) |
| Space | Nhảy |
| Shift | Lướt (14 m/s, hồi 1.5 s) |
| E | Nạp đom đóm vào đèn (đứng trong 2 m) |
| Q hoặc F | Tỏa sáng (tốn 3 đom đóm, hồi 3 s) |
| Kéo chuột / J, L | Xoay camera |
| Esc / P | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |

## Luật chính
- Mang tối đa 10 đom đóm; thắp một đèn cần 10 (nạp nhiều lần được). Bị Bóng Mực chạm: −1 Ngọn Lửa (3 Lửa), rơi một nửa đom đóm, bất tử 1.5 s. Rơi khỏi đảo: −1 Lửa, mất hết đom đóm, hồi sinh sau 1 s.
- Đèn đã sáng tạo vùng an toàn 6 m mà Bóng Mực không vào được.
- Gió Lạc (Đêm 2–3) cướp 3 đom đóm của người mang ≥ 5. Bùa Gió: chạy 7.2 m/s, Lướt không hồi chiêu (10 s).
- Điểm: +10/đom đóm nạp, +100/đèn, +5/Bóng Mực trúng Tỏa Sáng; thắng: +2/giây còn lại, +50/Lửa còn. Tổng điểm = tổng các Đêm đã thắng.
- Toàn bộ con số nằm ở [`game.contract.json`](game.contract.json) (`tuning`) và game đọc đúng file đó. Giả định: [`docs/notes/phase-2.md`](docs/notes/phase-2.md). Spec + tiêu chí nghiệm thu: [`docs/spec/phase-2.md`](docs/spec/phase-2.md).

## Headless (Test Contract v1.1)
```bash
npx tsx src/headless/cli.ts --seed 1 --night 2 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```
Không cần GPU/cửa sổ; `--night` 1, 2 hoặc 3. Cùng seed + scenario + inputs cho output giống hệt. File sai định dạng → mã thoát 2. Một Đêm đầy đủ (21.600 tick) chạy ~1.5 s.

## Kiểm chứng
```bash
npm test                  # 44 test: luật game, 3 bản đồ, tính tất định, mã thoát CLI, thời gian chạy
npm run proof -- phase-2  # chạy CLI thật trên 18 ca, ghi docs/proof/phase-2/REPORT.md
```
Bằng chứng: [`docs/proof/phase-1`](docs/proof/phase-1/REPORT.md), [`docs/proof/phase-2`](docs/proof/phase-2/REPORT.md). CI chạy build + test + proof mỗi lần push.

## Harness AI
[`AGENTS.md`](AGENTS.md) (+ `CLAUDE.md`), hook Stop chặn kết thúc khi test đỏ (`.claude/settings.json`), skill `verify-headless` (`.claude/skills/`).

## Sáng tạo của tôi
_(chưa thêm. Hiện chỉ có halo trên nón của Mây thay đổi theo số đom đóm đang mang, thuần hiển thị, không ảnh hưởng headless.)_

Đề bài gốc: [`docs/LAB-README.md`](docs/LAB-README.md). Nguồn asset: [`CREDITS.md`](CREDITS.md).
