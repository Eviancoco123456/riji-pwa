// 日迹配置
//
// 纯本地版：已移除云端同步（Supabase）。所有数据保存在本机浏览器 localStorage，
// 仅在「当前这台设备 + 当前浏览器」可用，不跨设备、不上云。
//
// 视觉识别：直连千问 dashscope（阿里云国内域名，中国大陆可访问，且支持浏览器跨域）。
// 说明：千问 Key 会暴露在前端（个人自用、非商业，风险可控）。
const VISION_API_KEY = 'sk-ws-H.EPIPDXP.enPJ.MEUCIQCispocKTYZq0OYYy0pDavjA6uq-cbYjGxV7z592-k1HgIgdcbMelXrszr6h1GqKXaoGis3mtSd0c12SECO7ucpVDw';
const VISION_MODEL = 'qwen-vl-max';
const VISION_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
