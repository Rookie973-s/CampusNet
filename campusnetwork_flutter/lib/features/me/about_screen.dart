import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key, this.isAdsShortcut = false});
  final bool isAdsShortcut;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text(
          isAdsShortcut ? 'Place Ads' : 'About, Help & Privacy',
          style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MorphismCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const BrandMark(size: 46),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('CampusNetwork (Cenet)', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                          Text('The Student Community & Academic Hub for ATBU', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  'CampusNetwork respects your privacy in line with the Nigeria Data Protection Act (NDPA). Private student data, verification documents, and private SUG chats are never exposed publicly.',
                  style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.55),
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
