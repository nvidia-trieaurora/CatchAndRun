# Harbor — quy trình chống xuyên vật thể trước khi đưa asset vào game

Ngày 10/09/2026. Đây là quy trình kiểm tra có công cụ chạy được, không phải cam kết mọi điểm trên đảo đã hết lỗi. Không tự thay GLB production.

Cập nhật sau duyệt: quy trình đã được áp dụng cho [Market RP04](../market-rp04/README.md), đã tích hợp một GLB vào game local qua bước promotion riêng. [Gate sau tích hợp](../market-rp04/post-promotion-gate-02/summary.json) đạt; các lượt import-timeout thất bại vẫn được giữ lại. Những bước browser/động học chưa được chứng minh đầy đủ được ghi riêng, không gộp thành “toàn đảo đã hết lỗi”.

Lượt tiếp theo [Fleet RP04](../fleet-rp04/README.md) cũng đã áp dụng local, có [gate sau thay asset](../fleet-rp04/post-promotion-gate/summary.json). `promote_fleet_rp04.mjs` yêu cầu thêm boong High/Low và chết đuối trên cả hai backend: tên mesh+bounds trong rig phải đúng hợp đồng, chân theo đúng mặt đã chọn, server-position match phải tính lại từ tọa độ thô. Báo cáo thấp nhất/ANY-support cũ đã từng chọn nhầm thân tàu và mái cabin; chúng được giữ lại và bị từ chối, không được nới guard để tiếp tục.

## Luồng bắt buộc cho đợt dựng tiếp theo

```text
Duyệt concept → khóa kích thước, cửa và tuyến chơi
                         ↓
Blender: dựng visual + collider + High/Low trong bản staging
                         ↓
Xuất GLB → kiểm tra định dạng → lắp bằng loader/map thật
                         ↓
Gate tĩnh → Hunter/Prop → boong/nước → báo cáo gắn SHA256
                         ↓
Trình duyệt: cùng camera + overlay collider + bắn/quay/rơi
                         ↓
Duyệt hình ảnh + hiệu năng → kiểm tra lại SHA → mới thay asset

Bất kỳ bước nào trượt → quay lại asset/code gây lỗi → chạy lại gate
```

Ảnh AI chỉ quyết định chất liệu, ánh sáng và ý đồ. Không lấy vị trí cửa/cầu thang/collider từ ảnh AI. Cần giữ đúng mesh đang nhìn thấy, node va chạm, pivot chuyển động và footprint đã chốt.

## Những gì đã tự động hóa

Chạy tại thư mục gốc dự án; cần dependencies đã cài:

```sh
npm run harbor:v2:verify-assets
```

Mặc định đọc 9 GLB production; ghi báo cáo vào một thư mục tạm riêng và in đường dẫn `summary.json`. Không sửa asset. Có thể lưu bằng `--out-dir`, nhưng thư mục đầu ra phải trống để không nhận nhầm báo cáo cũ.

Kiểm tra một bản đồ staging đầy đủ:

```sh
npm run harbor:v2:verify-assets -- --asset-dir art-source/harbor-v2/_staging/complete-map
```

Thư mục này cần có `warehouse.glb`, `cinematic/harbor-cinematic.glb` và `zones/` chứa `garden-ac`, `construction-ad`, `ferris-harbor`, `container-bd`, `operations-ab`, `response-station`, `rescue-quay` với đuôi `.glb`. Thiếu hoặc GLB hỏng sẽ trượt; không âm thầm dùng production thay thế. Sau export, đặt candidate vào cây staging này; chưa ghi đè `client/public`.

Kiểm tra báo cáo còn ứng với đúng dữ liệu hiện tại:

```sh
npm run harbor:v2:verify-assets -- --check-report docs/v2/harbor/asset-verification-rp04/review-02/summary.json
```

Kiểm tra chính công cụ gate, bao gồm tạo candidate hỏng trong thư mục tạm:

```sh
npm run harbor:v2:test-asset-gate
```

### Gate 1 — mặt nhìn thấy so với va chạm

`StaticAssetGate` dùng loader và `buildHarborV2Map` thật, gồm zone override, sàn trạm phản ứng và đóng/mở cổng. Mỗi High/Low có 43 phép đo: cửa/cửa sổ, sàn/mái, cột/cầu công trường, cửa xưởng/market, quầy vé, sân cứu hộ và tuyến xuất phát. Ray thị giác giữ trạng thái visible và hướng mặt; không ép mọi mặt thành hai phía để che lỗi normal.

Mỗi phép đo ghi tên, nguồn hợp đồng, tọa độ, mesh/collider trúng và đạt/trượt. Mái nghiêng so với collider bậc có số đo riêng, không nới sai số chung để cho qua. Đây là các điểm đo hữu hạn, không quét mọi tam giác hay tự chứng minh toàn bộ cấu trúc kín.

Negative controls ở mỗi tier: cố tình bỏ sàn vật lý, thêm vật cản vô hình, bịt một lối đang mở. Gate phải phát hiện cả ba và khôi phục trạng thái trong bộ nhớ. Nếu không bắt được lỗi giả lập thì lần kiểm tra cũng trượt.

### Gate 2 — nhân vật thật trên candidate

104 ca chuyển động trên candidate: 24 ca `AssetMovementVerification`, 40 ca `HarborMarketMovement`, 30 ca `HarborFleetMovement` và 10 ca `BoatObjectSupportChain`. Dùng controller thật và GLB từ đúng `--asset-dir`:

- Chạy vào tường quầy vé với frame dài 200 ms; bỏ collider phải làm lộ lỗi.
- Qua cửa hông; thêm collider vô hình phải chặn được nhân vật trong negative control.
- Rơi lên mái; bỏ mái vật lý phải làm nhân vật rơi xuyên.
- Nhảy đụng mặt dưới mái; nâng collider 12 cm phải bị phát hiện.
- Đứng trên boong thật; bỏ hỗ trợ boong phải chuyển sang trạng thái nước.
- Đi ba tuyến sân cứu hộ trên map lắp hoàn chỉnh; khôi phục collider cây cũ phải làm kẹt tuyến giữa.

Ca boong ban đầu đo một điểm trên một tàu. Fleet RP04 bổ sung năm tàu × High/Low × Hunter/Prop: tiếp xúc trong chu kỳ sóng, so chân với mesh nhìn thấy, nhảy và rơi xuống nước, xóa support làm negative control. Đồ duplicate dùng logic thật, có kiểm tra chồng đồ và người đứng trên đồ không nhận chuyển động tàu hai lần. Vẫn chưa chứng minh mọi boong/pose động: Prop là hình dạng mặc định, chưa phải mọi disguise/đồ vật. Đây là mô phỏng controller, không thay bài thử trình duyệt với server thật.

Market bổ sung: ba tuyến qua cửa chính, năm lối giữa kệ, cửa kho/văn phòng, kính với frame dài 200 ms, kệ đặc, rơi lên mái, nhảy đụng trần, khe gió/khung trần, rơi qua lỗ mái và leo thang. Mỗi nhóm có negative control. Bốn ca khe gió đã bắt đúng lỗi xuyên 23–47 mm mà 36 ca cũ bỏ sót; sau chỉnh thành trần âm, cả 40 ca đạt. Bài thử rơi qua lỗ mái độc lập với thang vì logic leo hiện không thực hiện collision sweep thông thường trên toàn bộ hành trình.

Sau lỗi phát hiện ở preview RP04, setup cũng từ chối mọi node/Group thuộc LOD đối nghịch còn sống. `MapAssetGroupedLod` dùng GLTFLoader thật với mesh nhiều material: metadata phải đi từ Group xuống primitive; bỏ High/Low phải bỏ cả nhánh, không chỉ mesh có hậu tố tên đúng.

### Gate 3 — hồi quy và tính toàn vẹn

96 test client về movement, broadphase, boong, nước, lifecycle, LOD và helper; 18 test server về movement/water/hazard. Đây là generic/default-map regressions, được ghi riêng: không giả vờ chúng đã đọc candidate và không gọi chúng là kiểm thử multiplayer trực tiếp.

Runner ghi SHA256 của từng candidate, bộ asset production mà test cũ dùng, nguồn/code/test/config và báo cáo con. Không cho qua khi subprocess thất bại, báo cáo thiếu/cũ, không chạy test, test bị skip hoặc byte/source đổi trong quá trình chạy. Bắt buộc đủ đúng tên của 43 probes và 3 negative controls trên mỗi tier; báo cáo bị rút gọn/trùng tên không đạt. `--check-report` kiểm tra lại tính mới và đúng checkout hiện tại. SHA phát hiện thay đổi; đây không phải chữ ký chống kẻ cố ý giả báo cáo.

Kết quả xanh là `bounded-headless-pass`, **luôn `readyToPromote: false`**. Các lệnh export/finalize cũ chưa được tự động khóa bởi runner này; không dùng chúng để bỏ qua quy trình.

Riêng Market RP04 có `promote_market_rp04.mjs`: bắt buộc native budgets/geometry report có SHA đúng, gate còn mới, cùng 9 asset và source SHA trong bốn browser reports (WebGPU/WebGL2 × High/Low), đủ góc ngoài/trong, không lỗi console và có ghi nhận duyệt hình. Chỉ thay một GLB Market, luôn giữ bản rollback theo hash. Không dùng script này để tuyên bố những vùng chưa đo đã hết xuyên/lag.

## Những gate vẫn cần thực hiện khi có art candidate

### Blender và export

- Soát scale mét, transform, pivot, normal, UV, đường viền mái và thành kính có độ dày; không còn panel lơ lửng/z-fighting.
- Hiển thị riêng render meshes và `COL_MOVE_*`; kiểm tra silhouette nhìn thấy có mặt chặn tương ứng ở tất cả mặt tiếp cận. Phân biệt collider chuyển động với đạn/camera/trigger nếu có.
- Collider cửa chỉ chặn ở trạng thái đóng; tránh AABB bao trùm cả cầu thang hoặc boong rỗng. LOD thấp không được đóng lại một cửa đang mở.
- Dùng validator GLB của từng zone và kiểm tra glTF hợp lệ; validator riêng cho warehouse không được coi là chứng nhận các zone khác.
- Render trước/sau cùng camera trong [shot-contracts.json](../photoreal-direction-rp04/shot-contracts.json), kiểm tra thêm góc ngang người và mặt dưới mái.

### Browser, vật lý động và hiệu năng

Chạy cùng bytes staging trong một instance QA riêng. Phải xác nhận response URL/hash thực sự là candidate; biến môi trường của headless test **không tự đổi asset mà Vite đang phục vụ**. Không kết nối vào phòng chơi đang có người.

Mỗi WebGPU/WebGL2 × High/Low: các góc tổng thể, góc khu, nội thất, góc nhìn Hunter/Prop; mở/đóng cổng theo vòng; rơi từ mái; nhảy đụng trần; đi dưới cầu thang; bám boong cả 5 tàu khi nghiêng/nhấp nhô; rơi xuống nước rồi thoát/đuối đúng thời gian. Kiểm tra thêm collider debug overlay và đa client; cả đồ vật/disguise có kích thước khác.

Script capture đã có trong repo, ví dụ trên QA server đang chạy (đổi URL nếu khác):

```sh
node tools/harbor-v2/capture_runtime_review.mjs --base-url http://localhost:5174 \
  --out-dir art-source/harbor-v2/_staging/rp04-webgpu-high --prefix rp04 \
  --renderer webgpu --quality high --presets overview,harborMarketFront,harborMarketInterior,workboatDetail,rescueQuay \
  --pan true --shoot true --water-check true --boat-check true
```

Lệnh trên là hướng dẫn cho lượt candidate tới, chưa chạy lại trong lượt concept này. Công cụ hiện chụp 1600×900, profile Chrome riêng và tắt âm thanh; không chứng minh âm thanh không gây khựng, mobile hay 4K.

Đề xuất tiêu chí đợt sau: không xuyên/kẹt ở ma trận đã chốt, không lỗi console, so frametime p95/p99 và số frame >50 ms trước/sau dưới cùng máy/backend/camera. Đo cold start và warm state, giữ chuột bắn và quay 360°; không lấy FPS trung bình làm tiêu chí duy nhất. Phải đo âm thanh bật ở lượt tương tác. Nếu tụt hiệu năng, tối ưu instance, LOD, vật liệu/texture và nước trước khi tăng chi tiết.

## Báo cáo lượt concept trước đây

Các kết quả dưới đây ghi lại thời điểm trước đợt triển khai Market. Source hiện tại đã đổi; dùng báo cáo mới trong [Market RP04](../market-rp04/README.md), không dùng freshness của báo cáo lịch sử để promote.

[review-02/summary.json](review-02/summary.json): 86 probes + 6 negative controls; 24 ca candidate; 81 client regressions; 18 server regressions đều đạt ngày 10/09/2026. Kiểm tra freshness đạt. Chạy riêng self-tests: 24 runner + 11 static gate + 12 helper đạt. Các báo cáo tĩnh/controller không phải ảnh render hay chứng nhận đồ họa mới.

Toàn bộ client: `npm run test -w client -- --maxWorkers=2` đạt 273/273 test, 38/38 suites. Một lần chạy full suite với concurrency mặc định trước đó bị timeout hook import GameManager 10 giây; chạy lại giới hạn 2 worker đạt, không tăng timeout hay bỏ test. Đây là giới hạn ổn định của lần chạy test được ghi nhận, không phải bằng chứng đã sửa một lỗi frametime trong game. TypeScript tập trung cho static gate và ESLint các test mới đạt; không tuyên bố toàn bộ build/typecheck dự án đã sạch.

`review-01` giữ làm lịch sử trước lượt sửa false-green; source đã đổi nên không dùng làm báo cáo hiện tại. Các regression được thêm theo trình tự gây lỗi trước rồi sửa, gồm visibility theo cha, vật liệu ẩn/alpha bằng 0, báo cáo thiếu phép đo và báo cáo thuộc checkout khác. Alpha theo từng pixel texture vẫn phải kiểm tra bằng render.

Không sửa GLB, file `.blend`, gameplay hay nước trong lượt tạo concept/gate này. Sau khi duyệt hình, mỗi khu mới phải đi lại toàn bộ luồng; nếu thay asset/source sau báo cáo thì phải chạy lại.
