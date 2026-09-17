# Phạm vi còn cần kiểm tra sau Market

Review chỉ đọc ngày 10/09/2026. Đây là khoảng trống kiểm thử, không phải khẳng định các tình huống này đang hỏng.

1. **Cả năm tàu với asset candidate:** `client/tests/helpers/actualHarborFleet.ts` còn đọc GLB production; candidate movement chỉ kiểm một workboat tĩnh. Cần chạy Hunter/Prop ở mép boong, cả chu kỳ sóng và frame dài trên từng tàu.
2. **Đồ vật trên tàu thật:** test lifecycle hiện dùng hộp tổng hợp để kiểm rơi/carry. Cần crates/duplicates rơi lên, đi cùng, trượt khỏi boong rồi vào nước bằng rig thực tế và `GameManager.updateDuplicatePhysics`.
3. **Tuyến toàn đảo và kỹ năng:** nhiều hợp đồng nhà/công trường là ray lấy mẫu. Cần nhân vật thật qua cạnh sàn, cột, cầu, mái và cửa sổ. Kiểm cả jump speed Hunter 13/18 trong runtime, không chỉ giá trị mặc định 11,5 của helper; kiểm hết hạn phase-walk ở sát tường.
4. **Cabin đu quay/cổng đang chuyển động:** test transform và trạng thái đóng/mở không thay thế người đang lên cabin, nhảy đụng trần, rời cabin hay đứng ở ngưỡng cổng khi cổng đổi trạng thái.
5. **Prop và mạng thật:** browser boat audit hiện chỉ Hunter; server integration không mô phỏng đầy đủ latency/jitter. Cần Prop/disguise nhiều kích thước, sống khi có boong đỡ và đuối đúng phía server khi rời boong.
6. **Hình nước và lag còn lại:** object/shader tests không chứng minh foam bờ, mặt nước trong thân tàu hoặc hiệu năng ảnh thực tế. Lượt High của Market vẫn có spike lúc bắn vào nước; phải profile riêng bằng cùng camera, có so A/B và kiểm cả âm thanh bật.

Không dùng báo cáo Market để tuyên bố các mục này đã hoàn tất. Với khu tiếp theo, mở rộng contract và negative control trước, rồi đi lại gate + browser trên đúng hash GLB.
