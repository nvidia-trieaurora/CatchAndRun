# Harbor RL01 — kiểm chứng trong game

Ngày 2026-09-09, Chrome headless trên máy Mac local, 1600 × 900, device scale 1,
quality High, GLB production RL01; phòng solo riêng. Đây không phải benchmark
4K, điện thoại hoặc nhiều người chơi. Helper bật GPU của Chrome và ép backend;
report kiểm tra backend thực tế, không chỉ dựa vào query string.

FPS và p95 dưới đây lấy từ khoảng cách `requestAnimationFrame` thô, không dùng
chỉ số FPS được clamp trong HUD. Mỗi góc lấy khoảng 4 giây sau khi ổn định;
mỗi mục bắn chạy 12 giây. Âm thanh tắt trong helper: đây là kiểm tra hiệu ứng
hình ảnh/raycast/nước, chưa phải benchmark đường âm thanh với loa bật.

Lượt High tạo browser process mới nhưng tái sử dụng **profile CDP chỉ dành cho
test**; vì vậy không chứng minh trường hợp disk shader cache hoàn toàn lạnh.
Helper được lưu trong repo hiện tạo profile tạm riêng bằng `mkdtemp` mỗi lượt.

| Phép thử | WebGPU High | WebGL2 High |
| --- | --- | --- |
| 7 góc nhìn | 58,51–60,00 FPS | 57,25–60,00 FPS |
| p95 góc nhìn | 16,7–16,8 ms | 16,7–16,8 ms |
| Frame góc nhìn chậm nhất | 33,4 ms | 50,1 ms, tại nhà kho |
| 42 phát xuống biển | ~60 FPS; max 16,8 ms | ~60 FPS; max 16,8 ms |
| 42 phát vào tường | ~60 FPS; max 16,8 ms | 59,92 FPS; max 33,4 ms |
| Frame khi bắn >50 ms | 0 | 0 |
| Renderer error | 0 | 0 |

Mỗi lượt bắn nước ghi nhận **41 va chạm mặt nước thật**, không nhầm thành bắn
vào trụ cầu tàu. Mỗi lượt bắn tường đo dấu đạn trực tiếp từ vertex trong world
space: đường kính tối đa **0,13 m**. Số geometry giữ 314 trong hai mục bắn.

Báo cáo đầy đủ: [WebGPU](rl01-webgpu-high-report.json),
[WebGL2](rl01-webgl2-high-report.json). Có một frame 66,6 ms trong đoạn *idle*
trước khi bắn tường trên WebGL2, ngoài outlier 50,1 ms ở góc nhà kho; vẫn giữ
nguyên trong report. Chưa khẳng định đã hết mọi giật khung hình hoặc xác định
nguyên nhân của các outlier riêng lẻ này.

## Ảnh game thực tế

| Nhà kho | Nhà vườn |
| --- | --- |
| ![Warehouse](rl01-webgpu-high-warehouse.png) | ![Garden](rl01-webgpu-high-acGarden.png) |
| Công trường | Container + Market |
| ![Construction](rl01-webgpu-high-adConstruction.png) | ![Container](rl01-webgpu-high-containerBD.png) |
| Operations | Cầu tàu + biển |
| ![Operations](rl01-webgpu-high-operationsAB.png) | ![Waterfront](rl01-webgpu-high-ferrisHarborWater.png) |

Ảnh này khác ảnh Blender 4K và concept trong thư mục cha. Biển `OLD HARBOR`
đã đọc được đầy đủ. Mái kim loại ở góc xa vẫn có lấm tấm/aliasing trong ảnh;
chất lượng thị giác chưa phải photorealistic hoàn chỉnh.
Kiểm đường tải High cho thấy LOD1 đã bị loại và các gân mái nằm phía trên mái;
chưa có bằng chứng đây là lỗi chồng LOD0/LOD1. Cần đánh giá thêm độ nhấp nháy
khi di chuyển camera, không gán nguyên nhân chỉ từ ảnh tĩnh.

## Low — kiểm tra hình ảnh, không benchmark FPS

Lượt smoke Low trên WebGPU/WebGL2 dùng profile tạm mới, nhưng chạy đồng thời
với công việc khác nên **không dùng số FPS**. Cả hai không có renderer error;
hiệu ứng nước ghi nhận 40 va chạm / 41 phát bắn, dấu đạn vẫn 13 cm.

Smoke này phát hiện cầu thang nhà kho bị bỏ khỏi LOD1 trong asset cũ. Sau khi
thêm 42 bậc + 2 sàn nghỉ với dầm, chân và lan can, đã chụp lại và kiểm tra
cầu thang hiện đúng trên cả hai backend. Test GLB thật kiểm thêm 132 điểm
mặt bậc sau khi loader đã bỏ High/collider khỏi scene render.

| WebGPU Low sau sửa | WebGL2 Low sau sửa |
| --- | --- |
| ![Low stairs WebGPU](rl01-webgpu-low-stairs-warehouse.png) | ![Low stairs WebGL2](rl01-webgl2-low-stairs-warehouse.png) |

Báo cáo sau sửa: [WebGPU Low stairs](rl01-webgpu-low-stairs-report.json),
[WebGL2 Low stairs](rl01-webgl2-low-stairs-report.json).
Các file `*-low-report.json` là smoke nước/bắn **trước** khi thêm cầu thang Low;
không dùng ảnh nhà kho trong các report cũ đó làm ảnh nghiệm thu cầu thang.

## Tái lập

Chạy client/server dev trước, không render Blender hoặc chạy test CPU đồng
thời nếu muốn so FPS. Helper dùng phòng riêng, không tham gia phòng đang chơi.

```sh
node tools/harbor-v2/capture_runtime_review.mjs --out-dir docs/v2/harbor/realism-review/runtime --prefix rl01-webgpu-high --renderer webgpu --quality high --shoot true --presets overview,warehouse,acGarden,adConstruction,containerBD,operationsAB,ferrisHarborWater
node tools/harbor-v2/capture_runtime_review.mjs --out-dir docs/v2/harbor/realism-review/runtime --prefix rl01-webgl2-high --renderer webgl2 --quality high --shoot true --presets overview,warehouse,acGarden,adConstruction,containerBD,operationsAB,ferrisHarborWater
```

Dùng `--chrome <executable>` hoặc `CHROME_PATH` nếu Chrome không ở đường dẫn
mặc định. Ảnh và report trước đó cùng prefix sẽ được thay bằng lượt đo mới.
