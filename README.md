# Đảo Đèn Lồng

> Video demo: _(sẽ thêm ở Phase 4 — Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js + TypeScript). Bạn là **Mây**, người giữ đèn nhỏ tuổi: gom đom đóm, thắp lại 5 Đèn Lồng Lớn trên Đảo Bến, né **Bóng Mực** hoặc tỏa sáng để xua chúng. Thắp hết đèn thì thắng; hết lửa hoặc hết đêm (300 s) thì thua.

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
| E | Nạp đom đóm vào đèn (đứng trong 3 m) |
| Q hoặc F | Tỏa sáng (tốn 2 đom đóm, hồi 3 s) |
| Kéo chuột / J, L | Xoay camera |
| R | Chơi lại |

## Luật và điểm
- Nhặt đom đóm trong 1.5 m (mang tối đa 6). Thắp một đèn cần 6 đom đóm.
- Bóng Mực chạm: −1 lửa (3 lửa), rơi một nửa đom đóm đang mang, miễn nhiễm 1.5 s. Không vào được bán kính 8 m quanh đèn **đã thắp**.
- Tỏa sáng: choáng 3 s + đẩy lùi 4 m mọi Bóng Mực trong 7 m.
- Điểm: 10/đom đóm, 200/đèn, 25/lần choáng, thắng: +2 mỗi giây còn lại, +100 mỗi lửa còn.
- Mọi con số nằm trong [`game.contract.json`](game.contract.json) (`tuning`), và game đọc đúng file đó. Các giả định: [`docs/notes/phase-1.md`](docs/notes/phase-1.md).

## Headless (Test Contract v1.0)
```bash
npx tsx src/headless/cli.ts --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenarios/pulse.scenario.json] [--inputs scenarios/pulse.inputs.json] [--snapshot-every 10]
```
Không cần GPU/cửa sổ. Cùng seed + scenario + inputs cho output giống hệt. File sai định dạng → mã thoát 2.

## Kiểm chứng
```bash
npm test          # 21 test: luật game, tính tất định, mã thoát CLI
npm run proof     # chạy CLI thật trên scenarios/, ghi docs/proof/phase-1/REPORT.md
```
Bằng chứng Phase 1: [`docs/proof/phase-1/REPORT.md`](docs/proof/phase-1/REPORT.md). CI chạy build + test + proof mỗi lần push.

## Harness AI
[`AGENTS.md`](AGENTS.md) (+ `CLAUDE.md`), hook Stop chặn kết thúc khi test đỏ (`.claude/settings.json`), skill `verify-headless` (`.claude/skills/`).

## Sáng tạo của tôi
_(Phase 1: chưa thêm. Ý định: đèn nhỏ trên nón của Mây sáng theo số đom đóm đang mang — chỉ ở phần hiển thị, không ảnh hưởng headless.)_

Tài liệu đề bài gốc: [`docs/LAB-README.md`](docs/LAB-README.md). Nguồn asset: [`CREDITS.md`](CREDITS.md).
