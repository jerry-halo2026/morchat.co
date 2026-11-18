export {
  mediaKeys,
  mediaIPDetailOptions,
  mediaIPListOptions,
  mediaScriptDetailOptions,
  mediaScriptListOptions,
  mediaShootDetailOptions,
  mediaShootListOptions,
  mediaTopicDetailOptions,
  mediaTopicListOptions,
} from "./queries";
export type { MediaResource } from "./queries";
export {
  useAttachMediaIPAccount,
  useCreateMediaIP,
  useCreateMediaScript,
  useCreateMediaShoot,
  useCreateMediaTopic,
  useDeleteMediaIP,
  useDeleteMediaScript,
  useDeleteMediaShoot,
  useDeleteMediaTopic,
  useDetachMediaIPAccount,
  useUpdateMediaIP,
  useUpdateMediaScript,
  useUpdateMediaShoot,
  useUpdateMediaTopic,
} from "./mutations";
export { MEDIA_SCORE_DIMENSIONS } from "../types/media";
export type {
  MediaScoreDimension,
  MediaScores,
  MediaSellingPoint,
  MediaShotItem,
  MediaShotList,
  MediaShotRhythm,
  MediaShotScene,
  MediaShotSize,
} from "../types/media";

// Hotspot radar and benchmark teardown (WORKBENCH-API §21). The two source ledgers
// behind the topic pool get their own modules — a radar row and a benchmarked
// account are captures, not pipeline stages — and are re-exported here so a screen
// that already imports `@morechat/core/media` does not need a second subpath.
export {
  EMPTY_MEDIA_HOT,
  EMPTY_MEDIA_HOT_LIST_RESPONSE,
  MediaHotListResponseSchema,
  MediaHotSchema,
  mediaHotDetailOptions,
  mediaHotListOptions,
  useAdoptMediaHot,
  useCreateMediaHot,
  useDeleteMediaHot,
  useUpdateMediaHot,
} from "./hot";
export {
  EMPTY_MEDIA_BENCH,
  EMPTY_MEDIA_BENCH_LIST_RESPONSE,
  MediaBenchListResponseSchema,
  MediaBenchSchema,
  mediaBenchDetailOptions,
  mediaBenchListOptions,
  useAdoptMediaBench,
  useCreateMediaBench,
  useDeleteMediaBench,
  useUpdateMediaBench,
} from "./bench";
export type {
  AdoptMediaRequest,
  CreateMediaBenchRequest,
  CreateMediaHotRequest,
  MediaBench,
  MediaBenchListFilters,
  MediaBenchListResponse,
  MediaHot,
  MediaHotListFilters,
  MediaHotListResponse,
  MediaHotSource,
  UpdateMediaBenchRequest,
  UpdateMediaHotRequest,
} from "../types/media";
