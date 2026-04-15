// Default prompts — used if admin hasn't configured any in the DB
let PROMPTS = [
  { icon: '🔓', label: 'I think I got hacked',             text: 'I think my account or device may have been compromised. What should I do right now?' },
  { icon: '🏢', label: 'Protect my small business',         text: 'I run a small business in Arkansas and want to improve my cybersecurity. Where should I start?' },
  { icon: '🏠', label: 'Secure my home network',            text: 'How do I secure my home Wi-Fi and router so my family is protected from hackers and intruders?' },
  { icon: '📧', label: 'I got a suspicious email',          text: "I just received an email that looks like it might be a phishing scam. How can I tell if it's real, and what should I do?" },
  { icon: '🔑', label: 'Make my passwords safer',           text: 'How do I make my passwords safer? I want practical advice on password managers and two-factor authentication.' },
  { icon: '🛡️', label: 'Keep my devices safe',              text: 'How do I keep my computer, phone, and tablet safe from hackers, viruses, and malware?' },
  { icon: '💳', label: 'I think I was scammed',             text: 'I think I was scammed online and may have given away my personal or financial information. What should I do?' },
  { icon: '📶', label: 'Is public Wi-Fi safe?',             text: 'Is it safe to use public Wi-Fi at coffee shops, hotels, or airports? What risks should I know about?' },
  { icon: '🔔', label: 'Set up security alerts',            text: 'How do I set up alerts to notify me if someone tries to access my accounts or if my information shows up in a data breach?' },
  { icon: '📱', label: 'Secure my phone',                   text: 'What steps should I take to secure my smartphone against hackers, theft, and snooping apps?' },
  { icon: '🧓', label: 'Protect a senior family member',    text: 'My elderly parent keeps getting targeted by online scams. How can I help them stay safe?' },
  { icon: '🛒', label: 'Safe online shopping',              text: 'How do I shop online safely and avoid fake websites, stolen card numbers, and package scams?' },
  { icon: '📸', label: 'My photos were shared without permission', text: 'Someone shared my personal photos online without my consent. What can I do about it?' },
  { icon: '🗂️', label: 'Back up my important files',        text: 'What is the best way to back up my important files and photos so I never lose them?' },
  { icon: '💼', label: 'Work from home securely',           text: 'I work from home and want to make sure my setup is secure. What should I do to protect my employer and myself?' },
  { icon: '🔍', label: 'Remove my info from the internet',  text: 'How do I find and remove my personal information from data broker websites and people-search engines?' },
  { icon: '🎮', label: 'Keep my kids safe gaming online',   text: 'My kids play online games and talk to strangers. How do I keep them safe from predators and scammers?' },
  { icon: '📲', label: 'I got a suspicious text',           text: 'I received a text message asking me to click a link or call a number. Could it be a scam, and what should I do?' },
  { icon: '🏦', label: 'Protect my bank accounts',          text: 'How do I protect my bank and financial accounts from fraud, unauthorized access, and identity theft?' },
  { icon: '🕵️', label: 'Someone is stalking me online',     text: 'I think someone is tracking or stalking me online. What steps can I take to protect my privacy and safety?' },
  { icon: '☁️', label: 'Is cloud storage safe?',            text: 'Is it safe to store sensitive documents and photos in the cloud? What should I know before using services like Google Drive or iCloud?' },
  { icon: '🔒', label: 'Lock down my social media',         text: 'How do I tighten the privacy settings on my social media accounts to limit who can see my information?' },
  { icon: '🏥', label: 'Protect my medical information',    text: 'How can I protect my personal health and medical records from being accessed or stolen online?' },
  { icon: '🚨', label: 'Report a cybercrime in Arkansas',   text: 'I want to report a cybercrime or online scam. Who do I contact in Arkansas, and what information do I need?' },
  { icon: '📡', label: 'Smart home device security',        text: 'I have smart home devices like cameras and speakers. How do I make sure they are not being used to spy on me?' },
  { icon: '🧹', label: 'Remove a virus from my computer',   text: 'I think my computer has a virus or malware. How do I safely remove it and prevent it from happening again?' },
  { icon: '🆔', label: 'My identity may have been stolen',  text: 'I think someone may have stolen my identity. What are the signs, and what steps should I take immediately?' },
  { icon: '🎣', label: 'What is phishing?',                 text: 'Can you explain what phishing is and teach me how to spot phishing emails, texts, and phone calls?' },
  { icon: '🖨️', label: 'Secure my printer and other devices', text: 'Are printers and other connected devices a security risk? How do I make sure they are not a weak point in my home network?' },
  { icon: '🔐', label: 'What is two-factor authentication?', text: 'What is two-factor authentication and how do I turn it on for my most important accounts?' },
];

async function loadPrompts() {
  try {
    const res = await fetch('/api/admin/public/prompts');
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) PROMPTS = data;
  } catch {}
}
