# Đảo Đèn Lồng

> Video demo: _(sẽ thêm ở Phase 4 — Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js + TypeScript). Bạn là **Mây**, người giữ đèn nhỏ tuổi: gom đom đóm, thắp lại các Đèn Lồng Lớn trên 3 hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông), né **Bóng Mực** và **Gió Lạc**, hoặc tỏa sáng để xua chúng. Mục tiêu: **giữ cho ít nhất 60% số đèn còn sáng tới bình minh** (3/5, 4/6, 5/7); hết Ngọn Lửa hoặc đèn sáng không đủ khi trời sáng thì thua.

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
- Sức chứa 10 đom đóm, +2 sau mỗi lần thắp thành công (tối đa 20). Thắp đèn mới cần 10 đom đóm, thắp lại đèn đã từng sáng chỉ cần 5. Bị Bóng Mực chạm: −1 Ngọn Lửa (3 Lửa), rơi một nửa đom đóm, bất tử 1.5 s. Rơi khỏi đảo: −1 Lửa, mất hết đom đóm, hồi sinh sau 1 s.
- Đèn sáng có **dầu** (100, hao 1/s). Bấm E cạnh đèn đang sáng để châm dầu (10 dầu/đom đóm). Hết dầu thì đèn tắt.
- Đèn còn dầu ≥ 30 tạo vùng an toàn 6 m; dưới 30 thì mất, và Bóng Mực sẽ lẻn tới hút 5 dầu/giây. Tỏa Sáng trúng con đang hút được thưởng thêm.
- Gió Lạc (Đêm 2–3) cướp 3 đom đóm của người mang ≥ 5. Bùa Gió: chạy 7.2 m/s, Lướt không hồi chiêu (10 s).
- Điểm: +5/đom đóm nạp (thắp hoặc châm dầu), +100 thắp lần đầu, +40 thắp lại, +5 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu đang hút dầu); bình minh (khi thắng): mỗi đèn sáng +50+⌊dầu⌋, mỗi Lửa +50. Tổng điểm = tổng các Đêm đã thắng.
- Toàn bộ con số nằm ở [`game.contract.json`](game.contract.json) (`tuning`) và game đọc đúng file đó. Giả định: [`docs/notes/`](docs/notes). Spec + tiêu chí nghiệm thu: [`docs/spec/`](docs/spec). Quyết định thiết kế: [`docs/adr/`](docs/adr). Thay đổi phá vỡ tương thích: [`CHANGELOG.md`](CHANGELOG.md).

## Headless (Test Contract v1.2)
```bash
npx tsx src/headless/cli.ts --seed 1 --night 2 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```
Không cần GPU/cửa sổ; `--night` 1, 2 hoặc 3. Cùng seed + scenario + inputs cho output giống hệt. File sai định dạng → mã thoát 2. Một Đêm đầy đủ (21.600 tick) chạy ~1.5 s.

## Kiểm chứng
```bash
npm test                  # 63 test: luật game, 3 bản đồ, nhiên liệu/hút dầu, tính tất định, mã thoát CLI
npm run proof -- phase-3  # chạy CLI thật trên 26 ca, ghi docs/proof/phase-3/REPORT.md
```
Bằng chứng: [`docs/proof/phase-1`](docs/proof/phase-1/REPORT.md), [`phase-2`](docs/proof/phase-2/REPORT.md), [`phase-3`](docs/proof/phase-3/REPORT.md) (mỗi báo cáo khớp mã ở tag tương ứng). CI chạy build + test + proof mỗi lần push.

## Harness AI
[`AGENTS.md`](AGENTS.md) (+ `CLAUDE.md`), hook Stop chặn kết thúc khi test đỏ (`.claude/settings.json`), skill `verify-headless` (`.claude/skills/`).

## Sáng tạo của tôi
_(chưa thêm. Hiện chỉ có halo trên nón của Mây thay đổi theo số đom đóm đang mang, thuần hiển thị, không ảnh hưởng headless.)_

Đề bài gốc: [`docs/LAB-README.md`](docs/LAB-README.md). Nguồn asset: [`CREDITS.md`](CREDITS.md).
