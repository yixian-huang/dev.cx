package httpx

import (
	"testing"
	"time"
)

// TestRateLimiterSweepsStaleBuckets 覆盖 allow() 里的惰性淘汰：buckets 没有容量上限，
// 一个 IP 若超过 10 分钟未活动，其桶必然已回满令牌，应被清理掉，否则公网可达的
// auth 端点会在扫描器/撞库流量下无界增长内存。同包测试，直接访问未导出字段构造场景。
func TestRateLimiterSweepsStaleBuckets(t *testing.T) {
	rl := newRateLimiter()
	rl.buckets["1.2.3.4"] = &bucket{tokens: 10, last: time.Now().Add(-11 * time.Minute)}

	rl.allow("9.9.9.9") // lastSweep 为零值，本次调用必然触发一次全量清理

	if _, ok := rl.buckets["1.2.3.4"]; ok {
		t.Fatal("bucket idle for 11m should have been swept")
	}
}
