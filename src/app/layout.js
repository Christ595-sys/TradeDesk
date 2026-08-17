import './globals.css';

export const metadata = {
  title: 'TradeDesk',
  description: 'A trading journal for traders',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
