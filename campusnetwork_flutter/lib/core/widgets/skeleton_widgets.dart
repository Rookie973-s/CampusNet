import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Shared shimmer pulse wrapper — adapts smoothly to Light & Dark modes.
class SkeletonShimmer extends StatefulWidget {
  const SkeletonShimmer({super.key, required this.child});
  final Widget child;

  @override
  State<SkeletonShimmer> createState() => _SkeletonShimmerState();
}

class _SkeletonShimmerState extends State<SkeletonShimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, child) => Opacity(
        opacity: 0.45 + (_ctrl.value * 0.45),
        child: child,
      ),
      child: widget.child,
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.radius = 10,
  });
  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF20242A) : const Color(0xFFE5E9EC),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class SkeletonCircle extends StatelessWidget {
  const SkeletonCircle({super.key, required this.size});
  final double size;

  @override
  Widget build(BuildContext context) => SkeletonBox(width: size, height: size, radius: size / 2);
}

/// X-style timeline post skeleton (used in FeedScreen & PublicProfile).
class FeedSkeletonList extends StatelessWidget {
  const FeedSkeletonList({super.key, this.count = 4});
  final int count;

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    return SkeletonShimmer(
      child: Column(
        children: [
          for (int i = 0; i < count; i++)
            Container(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: c.divider, width: 0.6)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SkeletonCircle(size: 40),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            SkeletonBox(width: 118, height: 13, radius: 6),
                            SizedBox(width: 8),
                            SkeletonBox(width: 58, height: 11, radius: 6),
                          ],
                        ),
                        const SizedBox(height: 10),
                        const SkeletonBox(height: 15, radius: 6),
                        const SizedBox(height: 7),
                        const SkeletonBox(width: 220, height: 13, radius: 6),
                        if (i % 2 == 0) ...[
                          const SizedBox(height: 10),
                          const SkeletonBox(height: 148, radius: 16),
                        ],
                        const SizedBox(height: 12),
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            SkeletonBox(width: 44, height: 22, radius: 99),
                            SkeletonBox(width: 44, height: 22, radius: 99),
                            SkeletonBox(width: 44, height: 22, radius: 99),
                            SkeletonBox(width: 30, height: 22, radius: 99),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// 2-column stacked folder skeleton for PDF Library.
class LibrarySkeletonGrid extends StatelessWidget {
  const LibrarySkeletonGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 16,
          crossAxisSpacing: 14,
          childAspectRatio: 0.88,
        ),
        itemCount: 6,
        itemBuilder: (_, __) => const SkeletonBox(height: 180, radius: 20),
      ),
    );
  }
}

/// Horizontal hero card + popular strip skeleton for SUG screen.
class SugSkeletonView extends StatelessWidget {
  const SugSkeletonView({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SkeletonBox(height: 390, radius: 28),
            const SizedBox(height: 18),
            const SkeletonBox(width: 140, height: 16, radius: 8),
            const SizedBox(height: 10),
            Row(
              children: const [
                Expanded(child: SkeletonBox(height: 92, radius: 18)),
                SizedBox(width: 10),
                Expanded(child: SkeletonBox(height: 92, radius: 18)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Featured card + list rows skeleton for Communities.
class CommunitiesSkeletonList extends StatelessWidget {
  const CommunitiesSkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: Column(
        children: [
          const SkeletonBox(height: 168, radius: 24),
          const SizedBox(height: 16),
          for (int i = 0; i < 4; i++)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  SkeletonCircle(size: 48),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 150, height: 14, radius: 6),
                        SizedBox(height: 6),
                        SkeletonBox(width: 210, height: 11, radius: 6),
                      ],
                    ),
                  ),
                  SizedBox(width: 10),
                  SkeletonBox(width: 64, height: 32, radius: 99),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Threaded comment bubbles skeleton.
class CommentsSkeletonList extends StatelessWidget {
  const CommentsSkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: Column(
        children: [
          for (int i = 0; i < 3; i++)
            Padding(
              padding: EdgeInsets.only(left: i == 1 ? 34 : 0, bottom: 16),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonCircle(size: 34),
                  SizedBox(width: 10),
                  Expanded(child: SkeletonBox(height: 82, radius: 18)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Chat list & messages skeleton.
class ChatsSkeletonList extends StatelessWidget {
  const ChatsSkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView.separated(
        padding: const EdgeInsets.all(14),
        itemCount: 6,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, __) => const Row(
          children: [
            SkeletonCircle(size: 46),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: 140, height: 14, radius: 6),
                  SizedBox(height: 6),
                  SkeletonBox(width: 220, height: 12, radius: 6),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Activity bar graph skeleton.
class ActivityChartSkeleton extends StatelessWidget {
  const ActivityChartSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    const heights = [26.0, 48.0, 18.0, 62.0, 34.0, 74.0, 40.0, 22.0, 56.0, 82.0, 38.0, 28.0, 64.0, 50.0];
    return SkeletonShimmer(
      child: SizedBox(
        height: 110,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final h in heights)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.5),
                  child: SkeletonBox(height: h, radius: 8),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Ads dashboard KPI + trend + cards skeleton.
class AdsDashboardSkeleton extends StatelessWidget {
  const AdsDashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: const [
          Row(
            children: [
              SkeletonBox(width: 72, height: 32, radius: 99),
              SizedBox(width: 8),
              SkeletonBox(width: 78, height: 32, radius: 99),
              SizedBox(width: 8),
              SkeletonBox(width: 78, height: 32, radius: 99),
            ],
          ),
          SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: SkeletonBox(height: 76, radius: 18)),
              SizedBox(width: 8),
              Expanded(child: SkeletonBox(height: 76, radius: 18)),
              SizedBox(width: 8),
              Expanded(child: SkeletonBox(height: 76, radius: 18)),
            ],
          ),
          SizedBox(height: 14),
          SkeletonBox(height: 165, radius: 22),
          SizedBox(height: 18),
          SkeletonBox(height: 108, radius: 20),
          SizedBox(height: 10),
          SkeletonBox(height: 108, radius: 20),
        ],
      ),
    );
  }
}

/// Public profile portrait card + posts skeleton.
class ProfileHeroSkeleton extends StatelessWidget {
  const ProfileHeroSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBox(height: 310, radius: 28),
          SizedBox(height: 20),
          SkeletonBox(width: 140, height: 16, radius: 8),
          SizedBox(height: 12),
          SkeletonBox(height: 92, radius: 18),
          SizedBox(height: 10),
          SkeletonBox(height: 92, radius: 18),
        ],
      ),
    );
  }
}
