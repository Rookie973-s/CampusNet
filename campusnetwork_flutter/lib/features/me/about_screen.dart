import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key, this.isAdsShortcut = false});
  final bool isAdsShortcut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(title: Text(isAdsShortcut ? 'Place Ads' : 'About, Help & Privacy', style: const TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MorphismCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    BrandMark(size: 46),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('CampusNetwork (Cenet)', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                          Text('The Student Community & Academic Hub for ATBU', style: TextStyle(color: CNColors.textMuted, fontSize: 12.5)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  'CampusNetwork respects your privacy in line with the Nigeria Data Protection Act (NDPA). Private student data, verification documents, and private SUG chats are never exposed publicly.',
                  style: TextStyle(color: CNColors.textMuted, fontSize: 13.5, height: 1.55),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => launchUrl(Uri.parse('mailto:support@campusnetwork.edu.ng')),
                  icon: const Icon(Icons.mail_outline_rounded),
                  label: const Text('Email Support (support@campusnetwork.edu.ng)'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
