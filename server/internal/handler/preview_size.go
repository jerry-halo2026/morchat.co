package handler

import "github.com/jerry-halo2026/morchat.co/server/internal/attachmentpreview"

func (h *Handler) maxPreviewSizeBytes() int64 {
	return attachmentpreview.EffectiveMaxSizeBytes(h.cfg.MaxPreviewSizeBytes)
}
