# InstaInsight 📊

**InstaInsight** is a privacy-first Instagram analytics tool built with React Native and Expo. It allows you to gain deep insights into your Instagram profile by analyzing your official data export — all processed locally on your device.

![InstaInsight Preview](https://img.shields.io/badge/Privacy-100%25_On--Device-green?style=for-the-badge&logo=shield)
![Technology](https://img.shields.io/badge/Built_with-Expo_&_React_Native-black?style=for-the-badge&logo=expo)

## ✨ Key Features

-   **Follower Analysis**: Identify who isn't following you back.
-   **Engagement Insights**: See your top likers and total comment count.
-   **Account History**: View your login activity and account growth trends.
-   **100% Private**: Your data never leaves your device. No Instagram login or password required.
-   **Native Experience**: Smooth animations and a premium dark UI.

## 🚀 How to Use

1.  **Request your data from Instagram**:
    -   Go to your Profile → ☰ Menu → **Your Activity**.
    -   Select **Download your information**.
    -   Choose **Download or transfer information**.
    -   Select **Some of your information** and choose **Followers and Following**, **Likes**, and **Comments**.
    -   **CRITICAL**: Select **Format: JSON** (HTML is supported but JSON is more reliable).
2.  **Import to InstaInsight**:
    -   Once you receive the ZIP file from Instagram, open InstaInsight.
    -   Tap **Import ZIP File** and select the file you downloaded.
    -   Wait for the processing to complete.
3.  **Explore your insights**:
    -   View your "Not Following Back" list.
    -   Check your engagement stats on the Dashboard.

## 🛠 Tech Stack

-   **Framework**: [Expo](https://expo.dev/) (SDK 52)
-   **UI**: React Native with [Expo Linear Gradient](https://docs.expo.dev/versions/latest/sdk/linear-gradient/)
-   **Navigation**: [Expo Router](https://docs.expo.dev/routing/introduction/)
-   **Data Processing**: [JSZip](https://stuk.github.io/jszip/) for local decompression
-   **Storage**: [Async Storage](https://react-native-async-storage.github.io/async-storage/) for local persistence

## 📦 Installation

To run this project locally:

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npx expo start
    ```

## 🔒 Privacy

InstaInsight is designed with privacy as the top priority. Unlike other Instagram "stalker" or "follower" apps, we **never** ask for your username or password. We only process the data you provide via the official Instagram export tool. None of your personal data is ever uploaded to any server.

---

*Disclaimer: This app is not affiliated with, authorized, maintained, sponsored or endorsed by Instagram or Meta.*
