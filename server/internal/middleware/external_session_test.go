package middleware

import (
	"github.com/multica-ai/multica/server/internal/auth"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestExternalSessionCloudFrontProofBounded(t *testing.T) {
	signer := testSigner(t)
	end := time.Now().Add(90 * time.Second).Truncate(time.Second)
	token, err := auth.NewExternalSession("ea65bf1b-9362-4bef-9d22-a222e13b2a31", "a@example.com", "A", end)
	if err != nil {
		t.Fatal(err)
	}
	next := RefreshCloudFrontCookies(signer)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{Name: auth.AuthCookieName, Value: token})
	rec := httptest.NewRecorder()
	Auth(nil, nil, nil, signer)(next).ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatal("native session rejected")
	}
	seen := false
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == "CloudFront-Policy" {
			seen = true
		}
		if cookie.Expires.After(end) {
			t.Fatal("CDN cookie outlives external proof")
		}
	}
	if !seen {
		t.Fatal("CDN policy not issued")
	}
}
