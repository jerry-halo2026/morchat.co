package knowledge

import (
	"context"
	"fmt"
)

// GetPage is Store.GetPage behind the space scope.
//
// A page is addressed by its own id, so the listing filter does not protect it:
// without this gate a member who learns a page id can read another department's
// space. A hidden page answers ErrSpaceNotFound, exactly like a hidden space, so
// the response does not confirm that the page exists.
func (s *Service) GetPage(ctx context.Context, workspaceID, viewerID, pageID string) (Page, error) {
	page, err := s.store.GetPage(ctx, workspaceID, pageID)
	if err != nil {
		return Page{}, err
	}
	if err := s.requirePageSpaceVisible(ctx, workspaceID, viewerID, page); err != nil {
		return Page{}, err
	}
	return page, nil
}

// PutPage is Store.PutPage behind the same gate: the write side of the same hole.
func (s *Service) PutPage(
	ctx context.Context,
	workspaceID, viewerID, pageID, content string,
	title *string,
	summary *string,
	baseRevision *int,
) (Page, error) {
	page, err := s.store.GetPage(ctx, workspaceID, pageID)
	if err != nil {
		return Page{}, err
	}
	if err := s.requirePageSpaceVisible(ctx, workspaceID, viewerID, page); err != nil {
		return Page{}, err
	}
	return s.store.PutPage(ctx, workspaceID, pageID, content, title, summary, baseRevision)
}

func (s *Service) requirePageSpaceVisible(ctx context.Context, workspaceID, viewerID string, page Page) error {
	if page.SpaceID == "" {
		return nil
	}
	visible, err := s.spaceVisible(ctx, workspaceID, viewerID, page.SpaceID)
	if err != nil {
		return err
	}
	if !visible {
		return fmt.Errorf("%w: page %s", ErrSpaceNotFound, page.ID)
	}
	return nil
}
