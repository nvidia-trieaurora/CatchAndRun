# Harbor RL01 — Blender, vật lí và nước

Ngày thực hiện: 2026-09-09. Đã áp dụng vào 6 GLB production của bản game local;
không commit, push hay deploy. Giữ nguyên các chỉnh sửa có sẵn trong working tree.

## Hình ảnh

`blender-*.png` là ảnh **3840 × 2160 được render từ mesh thật trong Blender Eevee**.
Đây là ảnh kiểm tra từng asset, dùng camera/ánh sáng xem trước, không phải ảnh game.
Không suy ra FPS chơi game ở 4K từ các ảnh này.

| Nhà kho | Công trường |
| --- | --- |
| [![Warehouse](blender-warehouse-v2.png)](blender-warehouse-v2.png) | [![Construction](blender-construction-ad.png)](blender-construction-ad.png) |
| Khu nhà vườn | Container + Harbor Market |
| [![Garden](blender-garden-ac.png)](blender-garden-ac.png) | [![Container yard](blender-container-bd.png)](blender-container-bd.png) |
| Xưởng vận hành cảng | Vòng quay + cầu tàu |
| [![Operations](blender-operations-ab.png)](blender-operations-ab.png) | [![Pier](blender-ferris-harbor.png)](blender-ferris-harbor.png) |

`harbor-six-zone-concept.png` là **ảnh định hướng do imagegen tạo**, không phải GLB,
texture được đưa vào game, hay bằng chứng game đã đạt chất lượng hình ảnh đó.
Prompt và nguồn tạo ảnh: [concept-prompt.md](concept-prompt.md).
Ảnh game và báo cáo trình duyệt nằm riêng trong [runtime/README.md](runtime/README.md).

![Game local — WebGPU high](runtime/rl01-webgpu-high-overview.png)

## Thay đổi thật trong Blender

- Cả 6 khu: tính bóng tiếp xúc cục bộ bằng 12 tia/điểm trong bán kính 0,8 m,
  lưu vào vertex colour, giữ texture PBR và màu vẽ có sẵn. Giới hạn tối 0,76
  để không biến thành lớp bẩn đen hoặc bóng nắng cố định.
- Không bake bóng của môi trường vào cây chuyển động, cabin, thuyền hoặc mesh
  dùng chung để instancing. Collider/rig/socket/marker/reference không đổi.
- Hiệu chỉnh cường độ normal trên bê tông và kim loại để bề mặt bớt gồ/nhiễu.
- 20 bản mã có bu-lông 3D tại các mặt trụ đã raycast xác nhận: vườn 3, công
  trường 15, container 2. Gộp thành 3 draw calls bổ sung trên toàn map; relief
  tối đa 17 mm. Không rải vật cản vào lối đi.
- Khôi phục biển SC04 từ GLB đang chạy vì `.blend` gốc chưa chứa 3 node biển
  này. Đẩy biển ra trước mép mái, thêm 2 tay đỡ trong cùng batch để chữ không
  bị thanh mái che khi nhìn từ trên cao.
- Sửa xe đẩy trong vườn: xoay/trả bánh về đúng trục, bánh và hai chân sau chạm
  nền cỏ ở y=0,12 m; thêm trục bánh, càng và khung đỡ chạm đáy thùng. Thêm 280
  tam giác vào batch thép có sẵn, không thêm draw call/collider hoặc chặn lối đi.
- Sửa cầu thang nhà kho biến mất ở Low: thêm LOD1 cho 42 bậc và 2 sàn nghỉ,
  khớp collider hiện hữu, có dầm/chân đỡ và lan can. Chỉ thêm 1.800 tam giác,
  2 draw call; Warehouse Low là 2.828 tam giác / 21 draw. Test raycast trên GLB
  thật kiểm tra 132 điểm mặt bậc sau khi loader chọn Low; không đổi High.
- Nén **riêng COLOR_0 thành 8-bit**. Không lượng tử hoá tọa độ collider,
  vị trí, UV hay normal. Không thêm texture AO/4K cho mọi vật nhỏ.

Mỗi file nguồn gốc được giữ nguyên. File làm việc mới là
`art-source/harbor-v2/<khu>/<tên>-realism.blend`.
Các GLB cũ có bản sao khôi phục; đường dẫn và SHA-256 nằm trong
[promotion.json](promotion.json). Tổng dung lượng tăng khoảng 1,33 MB cho cả 6
asset; riêng Ferris GLB nhỏ hơn bản trước. Đây không phải tối ưu dung lượng
ở mọi file: phần tăng là vertex colours và chi tiết có kiểm soát.

## Runtime và vật lí

- Gộp mesh giữ đúng hình học/UV/màu. Đã sửa lỗi 13 đệm va tàu, 6 sừng cleat và
  3 cuộn dây bị chồng vào vị trí bản sao đầu tiên. Ferris vẫn giữ 89 mesh sau
  xử lí từ 188 mesh LOD0 nguồn.
- Tôn trọng `castShadow:false` do Blender xuất. Trên asset trước RL01,
  bỏ được 17 batch/13.950 tam giác khỏi shadow pass, không xoá mesh nhìn thấy.
- Giải phóng tài nguyên của LOD/collider/khu thay thế không còn sử dụng; không
  dispose texture vẫn được mesh khác dùng chung. Low tier bỏ hẳn normal/AO map.
- Sửa stride màu RGB8 sau khi gộp các biến thể nhỏ để WebGPU nhận đúng vertex
  buffer; giữ màu đã chuẩn hoá, không làm thay đổi vị trí/UV. Các mesh GLB khác
  vẫn dùng dữ liệu màu nén có padding từ exporter.
- Sửa cache chuyển động dùng chung vật liệu: dây/cần cẩu và cây không còn
  nhận nhầm cùng một kiểu dao động.
- Grid va chạm giữ thứ tự collider, kiểm tra live cabin/decoy, xây lại khi map,
  cổng hoặc thành viên decoy đổi. Truy vấn khi đi bộ trên 493 collider procedural:
  microbenchmark 24.000 lượt, trung vị 17,96 → 7,65 ms. Đây chỉ là **CPU broadphase**,
  không phải FPS toàn game hay benchmark map GLB đầy đủ.
- Quét đầu nhân vật qua toàn bước nhảy để chặn mái mỏng. Chạm trần không bị
  đẩy ngang; không đứng dậy dưới gầm thấp; crouch trên không không dịch chân.
- Dọn mesh decoy cùng collider khi rời map. Dấu đạn giữ đường kính 13 cm và
  độ lệch mặt 2 mm dưới cả parent xoay/scale không đều; bản lỗi kéo dấu đạn
  đến 7,8–8,94 m trong test tái hiện. Dấu đạn vẫn đi theo vật thể chuyển động.
- Chuẩn bị shader của pool hiệu ứng sau khung hình render thế giới đầu tiên,
  và sau khi HDR mới sẵn sàng; không bật/tắt mesh thật để warmup. Có test cho
  hàng đợi, retry, dispose và map/environment đổi giữa chừng. Lượt QA phát hiện
  gọi compile quá sớm làm PMREM/sky đen; đã sửa lịch gọi và kiểm lại ảnh trước
  khi đo hiệu năng cuối.
- Mặt biển: bỏ transmission 0,8% vốn kích hoạt double-pass/copy framebuffer;
  giữ phản xạ môi trường và Fresnel. Sửa normal sang view space, bỏ tính ripple
  hết hạn, khớp envelope sóng CPU/GPU, dùng depth rejection dưới nền đảo.

## Kiểm tra và giới hạn

- 6/6 asset qua validator Blender: ngân sách geometry/draw/texture/payload,
  khoảng trống lối đi, footprint, collider và rig. Warehouse giữ RP01, SC02,
  structural supports và SC04. glTF validator không báo lỗi.
- Không đổi server gameplay/map JSON trong lượt RL01. Các thay đổi server và
  WaterSwim có sẵn của người dùng được giữ lại.
- Suite server hiện có 10 test lỗi thuộc GameplayFlow, MatchStateMachine,
  RoleAssigner và ScoringSystem (88 pass); không tuyên bố toàn bộ repo xanh.
- Client: **166/166 test pass**, 27 file. `npm run build` pass cả shared/server/client;
  `npm run lint` không có error (còn 1.149 warning trong working tree).
- WebGPU + WebGL2 high: mỗi backend thử 7 góc và 84 phát bắn; không có renderer
  error hay frame bắn >50 ms. Có outlier khi không bắn ở WebGL2, không khẳng định
  đã hết lag mọi góc. Số đo thô, điều kiện test và ảnh nằm trong `runtime/`.
  Log test/build/validator chi tiết tại `art-source/harbor-v2/_staging/realism/`.
- Không dùng HY-World, không bật/tốn GPU cloud Brev. Máy local đủ cho lượt bake
  và Eevee này. Chưa kiểm chứng hiệu năng trên điện thoại thật/multiplayer tải cao.

## Tái tạo

Chạy từ root repo. Trên máy này dùng executable thật của Blender; symlink
`blender` từng không tìm được thư mục resources.

```sh
node tools/harbor-v2/prepare_realism.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/realism_pass.py -- --zone all
node tools/harbor-v2/prepare_realism.mjs --quantize
```

Khi chỉ sửa một khu, có thể dùng `--quantize --zone garden-ac` (thay tên khu)
để không làm cũ báo cáo validator của 5 khu còn lại.

Chạy `validate_zone.py` cho 5 khu với input
`art-source/harbor-v2/_staging/realism/<tên>-runtime.glb` và metrics cùng tên;
Warehouse dùng `validate_warehouse.py` với các cờ `--require-rp01 --require-sc02
--require-structural-support --require-sign`. Tiếp đó chạy glTF validator, xem
ảnh và kiểm tra gameplay trước khi promote:

```sh
node tools/harbor-v2/prepare_realism.mjs --promote
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/render_realism_review.py -- --zone all
```

Promotion từ chối report thất bại/cũ hoặc sai dung lượng, đồng thời chạy glTF
validator trên byte của cả 6 file trước khi ghi bất kỳ file production nào.
Cập nhật version token
trong `harborZones.ts` và `GameManager.ts` cùng lượt promote để client nhận GLB mới.
Các lệnh export authoring cũ trong `package.json` vẫn chỉ tới `.blend` gốc;
để giữ RL01, dùng pipeline trên hoặc export từ file `*-realism.blend`.
