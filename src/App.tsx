/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Minus, 
  Languages, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Presentation,
  Loader2,
  CheckCircle2,
  Layout,
  Crown,
  Settings,
  X,
  Trash2,
  AlertCircle,
  FileText,
  ShieldAlert,
  Mic,
  MicOff,
  Home,
  Grid,
  FileText as WordIcon
} from 'lucide-react';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import { collection, doc, getDoc, setDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Slide, PresentationRequest, PresentationTheme } from './types';
import { 
  generatePresentationContent, 
  generateSlideImage, 
  generateAdditionalSlide 
} from './services/ai';
import { cn } from './lib/utils';

const FountainPenIcon = ({ className }: { className?: string }) => (
  <div className={cn("relative w-6 h-6 shrink-0 flex items-center justify-center", className)}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M12 19L19 12L22 15L15 22L12 19Z" fill="#1E40AF" /> {/* Dark Blue */}
      <path d="M12 19L5 12L2 15L9 22L12 19Z" fill="#60A5FA" /> {/* Light Blue */}
      <path d="M12 19L12 2L15 5L12 8L9 5L12 2Z" fill="#FACC15" /> {/* Yellow */}
      <path d="M12 19V22" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

const AutoFitText = ({ children, className, maxFontSize = 48, minFontSize = 12 }: { children: React.ReactNode, className?: string, maxFontSize?: number, minFontSize?: number }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = React.useState(maxFontSize);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      const { scrollHeight, clientHeight, scrollWidth, clientWidth } = container;
      if (scrollHeight > clientHeight || scrollWidth > clientWidth) {
        if (fontSize > minFontSize) {
          setFontSize((prev) => Math.max(minFontSize, prev - 1));
        }
      }
    };

    // Reset font size when children change to try to fit at max size again
    setFontSize(maxFontSize);
    
    // Use a small timeout to let the DOM update before checking overflow
    const timeoutId = setTimeout(checkOverflow, 50);
    return () => clearTimeout(timeoutId);
  }, [children, maxFontSize, minFontSize]);

  // Second effect to keep shrinking if still overflowing
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container.scrollHeight > container.clientHeight || container.scrollWidth > container.clientWidth) {
      if (fontSize > minFontSize) {
        const timeoutId = setTimeout(() => {
          setFontSize((prev) => Math.max(minFontSize, prev - 1));
        }, 10);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [fontSize, minFontSize]);

  return (
    <div 
      ref={containerRef} 
      className={cn("overflow-hidden w-full h-full", className)}
      style={{ fontSize: `${fontSize}px` }}
    >
      {children}
    </div>
  );
};

export default function App() {
  const [topic, setTopic] = useState('');
  const [currentPage, setCurrentPage] = useState<'home' | 'powerpoint' | 'word'>('home');
  const [slideCount, setSlideCount] = useState(5);
  const [language, setLanguage] = useState<'English' | 'Greek'>('English');
  const [includeImages, setIncludeImages] = useState(true);
  const [theme, setTheme] = useState<PresentationTheme>('Modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [generationStep, setGenerationStep] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showSlideMenu, setShowSlideMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = React.useRef<any>(null);
  const shouldListenRef = React.useRef(false);
  const [thumbnailScroll, setThumbnailScroll] = useState(0);
  const thumbnailRef = React.useRef<HTMLDivElement>(null);
  const [isPremium, setIsPremium] = useState(() => localStorage.getItem('is_premium') === 'true');
  const [showProModal, setShowProModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [proError, setProError] = useState(false);
  const [proCode, setProCode] = useState('');
  const [adminCodes, setAdminCodes] = useState<{id: string, code: string, used: boolean}[]>([]);
  const [newAdminCode, setNewAdminCode] = useState('');
  const [userIp, setUserIp] = useState('');

  useEffect(() => {
    // Get user IP
    const storedIp = localStorage.getItem('user_ip') || `ip_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('user_ip', storedIp);
    setUserIp(storedIp);

    // Listen for user premium status
    const unsubStatus = onSnapshot(doc(db, 'user_status', storedIp), (doc) => {
      if (doc.exists()) {
        const premium = doc.data().isPremium;
        setIsPremium(premium);
        localStorage.setItem('is_premium', premium.toString());
      }
    });

    return () => {
      unsubStatus();
    };
  }, []);

  // Listen for admin codes only when admin panel is open
  useEffect(() => {
    if (!showAdminPanel) return;

    const unsubCodes = onSnapshot(collection(db, 'premium_codes'), (snapshot) => {
      const codes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAdminCodes(codes);
    });

    return () => unsubCodes();
  }, [showAdminPanel]);

  const handleProCodeSubmit = async () => {
    if (proCode === '000') {
      setShowAdminPanel(true);
      setShowProModal(false);
      setProCode('');
      return;
    }

    try {
      const q = query(collection(db, 'premium_codes'), where('code', '==', proCode));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // We found the code. We don't mark it as used anymore so anyone can use it.
        await setDoc(doc(db, 'user_status', userIp), {
          isPremium: true,
          activatedAt: serverTimestamp()
        });
        setIsPremium(true);
        localStorage.setItem('is_premium', 'true');
        setShowProModal(false);
        setProCode('');
        alert('Premium activated forever!');
      } else {
        alert('Invalid code.');
      }
    } catch (error) {
      console.error('Error activating premium:', error);
      alert('An error occurred while activating premium. Please check your connection.');
    }
  };

  const addCode = async () => {
    if (!newAdminCode) {
      alert('Please enter a code to add.');
      return;
    }
    try {
      await addDoc(collection(db, 'premium_codes'), {
        code: newAdminCode,
        used: false, // Keeping this for backward compatibility in the UI list
        createdAt: serverTimestamp()
      });
      setNewAdminCode('');
      alert('Code added successfully!');
    } catch (error) {
      console.error('Error adding code:', error);
      alert('Failed to add code. Please check your connection.');
    }
  };

  const removeCode = async (id: string) => {
    await deleteDoc(doc(db, 'premium_codes', id));
  };

  const handleCreate = async () => {
    if (!topic.trim()) return;

    setIsGenerating(true);
    setSlides([]);
    setCurrentSlideIndex(0);
    setGenerationStep(language === 'English' ? 'Generating content...' : 'Δημιουργία περιεχομένου...');

    try {
      const generatedSlides = await generatePresentationContent({
        topic,
        slideCount,
        language,
        includeImages,
        theme
      });

      setSlides(generatedSlides);

      if (includeImages) {
        setGenerationStep(
          language === 'English' 
            ? `Generating images for all slides...` 
            : `Δημιουργία εικόνων για όλες τις διαφάνειες...`
        );

        // Parallelize image generation for speed
        const imagePromises = generatedSlides.map(async (slide, i) => {
          try {
            const imageUrl = await generateSlideImage(slide.imagePrompt || slide.title);
            return { index: i, imageUrl };
          } catch (err) {
            console.error(`Failed to generate image for slide ${i}`, err);
            return { index: i, imageUrl: null };
          }
        });

        const results = await Promise.all(imagePromises);
        
        const updatedSlides = [...generatedSlides];
        results.forEach(res => {
          if (res.imageUrl) {
            updatedSlides[res.index].imageUrl = res.imageUrl;
          }
        });
        setSlides(updatedSlides);
      }
    } catch (error) {
      console.error(error);
      alert(language === 'English' ? 'Failed to generate presentation.' : 'Αποτυχία δημιουργίας παρουσίασης.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const downloadPptx = () => {
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';

    const themeColors = {
      Modern: { bg: 'FFFFFF', title: '1E293B', text: '475569', accent: 'F97316' },
      Classic: { bg: 'F8FAFC', title: '0F172A', text: '334155', accent: '2563EB' },
      Vibrant: { bg: 'EEF2FF', title: '312E81', text: '4338CA', accent: '8B5CF6' },
      Dark: { bg: '0F172A', title: 'F8FAFC', text: 'CBD5E1', accent: 'F97316' },
      Professional: { bg: 'F1F5F9', title: '1E293B', text: '334155', accent: '0F172A' },
      Creative: { bg: 'FFF7ED', title: '7C2D12', text: '9A3412', accent: 'EA580C' },
      Minimalist: { bg: 'FFFFFF', title: '000000', text: '262626', accent: '000000' },
      Corporate: { bg: 'F8FAFC', title: '1E3A8A', text: '1E40AF', accent: '1E3A8A' }
    }[theme];

    slides.forEach((slide) => {
      const s = pres.addSlide();
      s.background = { color: themeColors.bg };

      // Dynamic font sizing for PPTX - Increased as requested
      const titleLen = slide.title.length;
      const titleSize = titleLen < 30 ? 44 : titleLen < 60 ? 34 : 28;

      const totalContentLen = slide.content.join('').length;
      const contentSize = totalContentLen < 200 ? 24 : totalContentLen < 400 ? 20 : 18;

      // Title
      s.addText(slide.title, {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: 1,
        fontSize: titleSize,
        bold: true,
        color: themeColors.title,
        fontFace: 'Arial'
      });

      // Content & Image with custom sizing
      const imgW = (slide.imageWidth || 45) / 10; // Convert percentage to inches (approx 10 inch width)
      const imgH = (slide.imageHeight || 60) / 10; // Convert percentage to inches (approx 7.5 inch height)
      
      if (slide.imageUrl) {
        s.addText(slide.content.join('\n\n'), {
          x: 0.5,
          y: 1.5,
          w: 9.5 - imgW,
          h: 5.5, // Increased height to reach bottom
          fontSize: contentSize,
          color: themeColors.text,
          bullet: true,
          valign: 'top'
        });

        // Handle base64 vs URL for pptxgenjs
        const imgOptions = {
          x: 10 - imgW - 0.5,
          y: 1.5,
          w: imgW,
          h: imgH
        };

        if (slide.imageUrl.startsWith('data:')) {
          s.addImage({
            data: slide.imageUrl,
            ...imgOptions
          });
        } else {
          s.addImage({
            path: slide.imageUrl,
            ...imgOptions
          });
        }
      } else {
        s.addText(slide.content.join('\n\n'), {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 5.5, // Increased height to reach bottom
          fontSize: contentSize,
          color: themeColors.text,
          bullet: true,
          valign: 'top'
        });
      }
    });

    pres.writeFile({ fileName: `PowerPointAI_${topic.replace(/\s+/g, '_')}.pptx` });
    setShowDownloadMenu(false);
  };

  const downloadDocx = async () => {
    setIsExporting(true);
    setShowDownloadMenu(false);
    try {
      const docChildren: any[] = [];

      // Theme colors for Word
      const getThemeColor = () => {
        switch (theme) {
          case 'Modern': return 'F97316'; // Orange
          case 'Classic': return '2563EB'; // Blue
          case 'Vibrant': return 'A855F7'; // Purple
          case 'Dark': return 'F97316'; // Orange
          case 'Professional': return '0F172A'; // Slate
          case 'Creative': return 'EA580C'; // Orange-600
          case 'Minimalist': return '000000'; // Black
          case 'Corporate': return '1E40AF'; // Blue-800
          case 'Green': return '16A34A'; // Green-600
          case 'Blue': return '3B82F6'; // Blue-500
          default: return '2563EB';
        }
      };

      const themeColor = getThemeColor();

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        setExportProgress(Math.round(((i + 1) / slides.length) * 100));
        
        // Color Bar above title
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: " ",
                size: 12,
              }),
            ],
            shading: {
              fill: themeColor,
            },
            spacing: { before: 200, after: 100 },
          })
        );

        // Title
        docChildren.push(
          new Paragraph({
            text: slide.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            spacing: { before: 100, after: 400 },
          })
        );

        // Layout: 2-column table (Text on Left, Image on Right)
        const tableCells: TableCell[] = [];

        // Left Column: Content
        const contentParagraphs = slide.content.map((point) => (
          new Paragraph({
            children: [
              new TextRun({
                text: `* ${point}`, // Asterisks as requested
                size: 24,
                color: themeColor, // Use theme color for asterisks
              }),
            ],
            spacing: { before: 120, after: 120 },
          })
        ));

        tableCells.push(
          new TableCell({
            children: contentParagraphs,
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
          })
        );

        // Right Column: Image
        if (includeImages && slide.imageUrl) {
          try {
            const response = await fetch(slide.imageUrl);
            const buffer = await response.arrayBuffer();
            
            tableCells.push(
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: new Uint8Array(buffer),
                        transformation: {
                          width: 300,
                          height: 400, // Long image as requested
                        },
                      } as any),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 40, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                },
              })
            );
          } catch (imgError) {
            console.error('Error adding image to Word:', imgError);
          }
        }

        docChildren.push(
          new Table({
            rows: [
              new TableRow({
                children: tableCells,
              }),
            ],
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
          })
        );

        // Watermark if not premium
        if (!isPremium) {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "filip Studio",
                  size: 16,
                  color: "888888",
                  italics: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 400 },
            })
          );
        }

        // Page break (except for the last slide)
        if (i < slides.length - 1) {
          docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: docChildren,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Word_AI_${topic.replace(/\s+/g, '_')}.docx`);
    } catch (error) {
      console.error('Error generating Word document:', error);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const downloadPdf = async () => {
    setIsExporting(true);
    setShowDownloadMenu(false);
    
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1280, 720]
    });

    const slideElement = document.getElementById('slide-content');
    if (!slideElement) return;

    const originalIndex = currentSlideIndex;

    for (let i = 0; i < slides.length; i++) {
      setCurrentSlideIndex(i);
      setExportProgress(Math.round(((i + 1) / slides.length) * 100));
      
      // Wait for React to render the slide AND for images to load
      // Reduced timeout for faster export
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const images = slideElement.getElementsByTagName('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      await Promise.all(imagePromises);

      const canvas = await html2canvas(slideElement, {
        scale: 1.0, // Minimum scale for maximum speed
        useCORS: true,
        allowTaint: true,
        backgroundColor: theme === 'Dark' ? '#0F172A' : '#FFFFFF',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      if (i > 0) pdf.addPage([1280, 720], 'landscape');
      pdf.addImage(imgData, 'JPEG', 0, 0, 1280, 720);
    }

    pdf.save(`PowerPointAI_${topic.replace(/\s+/g, '_')}.pdf`);
    setCurrentSlideIndex(originalIndex);
    setIsExporting(false);
    setExportProgress(0);
  };

  const handleAddSlide = async () => {
    if (isGenerating) return;
    if (slides.length >= 15 && !isPremium) {
      setProError(true);
      setTimeout(() => setProError(false), 3000);
      return;
    }

    setIsGenerating(true);
    setGenerationStep(language === 'English' ? 'Generating new slide...' : 'Δημιουργία νέας διαφάνειας...');

    try {
      const newSlide = await generateAdditionalSlide(topic, slides, language);
      
      if (includeImages) {
        setGenerationStep(language === 'English' ? 'Generating image...' : 'Δημιουργία εικόνας...');
        const imageUrl = await generateSlideImage(newSlide.imagePrompt || newSlide.title);
        newSlide.imageUrl = imageUrl;
      }

      setSlides(prev => [...prev, newSlide]);
      setCurrentSlideIndex(slides.length);
    } catch (error) {
      console.error(error);
      alert(language === 'English' ? 'Failed to add slide.' : 'Αποτυχία προσθήκης διαφάνειας.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const updateSlideTitle = (index: number, newTitle: string) => {
    const updatedSlides = [...slides];
    updatedSlides[index].title = newTitle;
    setSlides(updatedSlides);
  };

  const updateSlideContent = (slideIndex: number, pointIndex: number, newText: string) => {
    const updatedSlides = [...slides];
    updatedSlides[slideIndex].content[pointIndex] = newText;
    setSlides(updatedSlides);
  };

  const updateSlideImageSize = (width: number, height: number) => {
    const updatedSlides = [...slides];
    updatedSlides[currentSlideIndex].imageWidth = width;
    updatedSlides[currentSlideIndex].imageHeight = height;
    setSlides(updatedSlides);
  };

  const scrollThumbnails = (direction: 'left' | 'right') => {
    if (thumbnailRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      thumbnailRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert(language === 'English' ? 'Speech recognition is not supported in your browser.' : 'Η αναγνώριση ομιλίας δεν υποστηρίζεται στο πρόγραμμα περιήγησής σας.');
      return;
    }

    if (isListening) {
      shouldListenRef.current = false;
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    shouldListenRef.current = true;
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'Greek' ? 'el-GR' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (event.results[event.results.length - 1].isFinal) {
        setTopic(prev => prev + (prev ? ' ' : '') + transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      
      if (event.error === 'not-allowed') {
        alert(language === 'English' 
          ? 'Microphone access is blocked. Please allow microphone permissions in your browser settings to use voice input.' 
          : 'Η πρόσβαση στο μικρόφωνο είναι αποκλεισμένη. Παρακαλώ επιτρέψτε τις άδειες μικροφώνου στις ρυθμίσεις του προγράμματος περιήγησής σας.');
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === 'network') {
        alert(language === 'English'
          ? 'Network error occurred during speech recognition. Please check your connection.'
          : 'Παρουσιάστηκε σφάλμα δικτύου κατά την αναγνώριση ομιλίας. Παρακαλώ ελέγξτε τη σύνδεσή σας.');
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === 'aborted') {
        // Aborted usually means it was stopped manually or by another process
        // We don't necessarily want to alert here, just reset state if we're not supposed to be listening
        if (!shouldListenRef.current) {
          setIsListening(false);
        }
      } else {
        // For other errors, we might want to stop
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // If shouldListenRef.current is still true, it means it stopped due to silence or timeout
      // We should restart it to keep it "always on" until toggled off
      if (shouldListenRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error('Failed to restart recognition', e);
          setIsListening(false);
          shouldListenRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };
  const getTitleSizeClass = (text: string) => {
    const len = text.length;
    if (len < 20) return "text-3xl lg:text-5xl";
    if (len < 40) return "text-2xl lg:text-4xl";
    if (len < 60) return "text-xl lg:text-3xl";
    if (len < 80) return "text-lg lg:text-2xl";
    return "text-base lg:text-xl";
  };

  const getContentSizeClass = (content: string[]) => {
    const totalLen = content.join('').length;
    if (totalLen < 150) return "text-lg lg:text-xl";
    if (totalLen < 300) return "text-base lg:text-lg";
    if (totalLen < 450) return "text-sm lg:text-base";
    if (totalLen < 600) return "text-xs lg:text-sm";
    if (totalLen < 800) return "text-[10px] lg:text-xs";
    return "text-[9px] lg:text-[10px]";
  };

  const themes: { id: PresentationTheme; label: string; color: string }[] = [
    { id: 'Modern', label: language === 'English' ? 'Modern' : 'Μοντέρνο', color: 'bg-orange-500' },
    { id: 'Classic', label: language === 'English' ? 'Classic' : 'Κλασικό', color: 'bg-blue-600' },
    { id: 'Vibrant', label: language === 'English' ? 'Vibrant' : 'Ζωντανό', color: 'bg-purple-500' },
    { id: 'Dark', label: language === 'English' ? 'Dark' : 'Σκούρο', color: 'bg-slate-900' },
    { id: 'Professional', label: language === 'English' ? 'Professional' : 'Επαγγελματικό', color: 'bg-slate-700' },
    { id: 'Creative', label: language === 'English' ? 'Creative' : 'Δημιουργικό', color: 'bg-orange-400' },
    { id: 'Minimalist', label: language === 'English' ? 'Minimalist' : 'Μινιμαλιστικό', color: 'bg-white border border-slate-300' },
    { id: 'Corporate', label: language === 'English' ? 'Corporate' : 'Εταιρικό', color: 'bg-blue-900' },
    { id: 'Green', label: language === 'English' ? 'Green' : 'Πράσινο', color: 'bg-green-600' },
    { id: 'Blue', label: language === 'English' ? 'Blue' : 'Μπλε', color: 'bg-blue-500' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden pt-20 lg:pt-0">
      {/* Sticky Header */}
      <header className="fixed top-0 left-0 right-0 h-20 lg:h-16 bg-white border-b border-slate-200 z-[60] flex items-center justify-between px-4 lg:px-10 shadow-sm">
        <div className="flex items-center gap-2 lg:gap-4">
          <button 
            onClick={() => setCurrentPage('home')}
            className={cn(
              "p-2 lg:p-2.5 rounded-xl lg:rounded-2xl shadow-lg transition-all active:scale-95 hover:scale-105",
              currentPage === 'home' ? "bg-green-600 shadow-green-200" : (currentPage === 'word' ? "bg-blue-600 shadow-blue-200" : "bg-orange-500 shadow-orange-200")
            )}
          >
            <Presentation className="text-white w-5 h-5 lg:w-6 lg:h-6" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-base lg:text-xl font-display font-black tracking-tight text-slate-900 leading-none">
              {currentPage === 'home' ? 'filip' : (currentPage === 'word' ? 'Word\u00A0' : 'PowerPoint\u00A0')} <span className={currentPage === 'home' ? "text-green-600" : (currentPage === 'word' ? "text-blue-600" : "text-orange-500")}>{currentPage === 'home' ? 'Studio' : 'AI'}</span>
            </h1>
            <p className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] lg:tracking-[0.2em] mt-0.5 whitespace-nowrap">
              {currentPage === 'home' ? 'The Beginning' : (currentPage === 'word' ? 'Professional Documents' : 'Professional Slides')}
            </p>
          </div>
          
          <button 
            onClick={() => setShowProModal(true)}
            className={cn(
              "flex items-center gap-1.5 lg:gap-2 px-3 py-1.5 lg:px-4 lg:py-2 rounded-full ml-2 transition-all active:scale-95",
              isPremium 
                ? "bg-orange-50 border border-orange-100 text-orange-600 shadow-sm" 
                : "bg-orange-500 text-white shadow-lg shadow-orange-100 animate-pulse"
            )}
          >
            <Crown className={cn("w-3 h-3 lg:w-4 lg:h-4", isPremium ? "text-orange-500" : "text-white")} />
            <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
              {isPremium ? 'Premium Activated' : 'Premium'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {currentPage !== 'home' && (
            <button 
              onClick={() => setCurrentPage('home')}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-900"
              title="Home"
            >
              <Home className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {currentPage === 'home' ? (
        <main className="flex-1 mt-20 lg:mt-16 bg-slate-50 overflow-y-auto p-6 lg:p-12">
          <div className="max-w-6xl mx-auto space-y-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <h2 className="text-5xl lg:text-7xl font-display font-black text-slate-900 tracking-tight">
                filip <span className="text-green-600">Studio</span>
              </h2>
              <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto">
                Welcome to the beginning. This application is currently under development, but you can explore our available tools below.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: [0, -10, 0],
                }}
                transition={{
                  opacity: { duration: 0.5 },
                  y: { repeat: Infinity, duration: 4, ease: "easeInOut" }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-orange-500 rounded-[2.5rem] blur-2xl opacity-0 group-hover:opacity-20 transition-opacity" />
                <button
                  onClick={() => setCurrentPage('powerpoint')}
                  className="relative w-full aspect-square bg-white border-2 border-slate-100 rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-6 shadow-xl shadow-slate-200/50 hover:border-orange-500 transition-all overflow-hidden"
                >
                  <motion.div 
                    animate={{ rotate: [0, 90, 180, 270, 360] }}
                    transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                    className="absolute -top-12 -right-12 w-48 h-48 bg-orange-50 rounded-full blur-3xl"
                  />
                  
                  <div className="bg-orange-500 p-6 rounded-3xl shadow-lg shadow-orange-200 group-hover:scale-110 transition-transform">
                    <Grid className="w-12 h-12 text-white" />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-display font-black text-slate-900">Tools</h3>
                    <div className="flex flex-col gap-1">
                      <span className="text-orange-500 font-black text-sm uppercase tracking-widest">AI PowerPoint</span>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Click to Open</p>
                    </div>
                  </div>
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: [0, -10, 0],
                }}
                transition={{
                  opacity: { duration: 0.5 },
                  y: { repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.2 }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-blue-600 rounded-[2.5rem] blur-2xl opacity-0 group-hover:opacity-20 transition-opacity" />
                <button
                  onClick={() => setCurrentPage('word')}
                  className="relative w-full aspect-square bg-white border-2 border-slate-100 rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-6 shadow-xl shadow-slate-200/50 hover:border-blue-600 transition-all overflow-hidden"
                >
                  <motion.div 
                    animate={{ rotate: [0, 90, 180, 270, 360] }}
                    transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                    className="absolute -top-12 -right-12 w-48 h-48 bg-blue-50 rounded-full blur-3xl"
                  />
                  
                  <div className="bg-blue-600 p-6 rounded-3xl shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                    <WordIcon className="w-12 h-12 text-white" />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-display font-black text-slate-900">Tools</h3>
                    <div className="flex flex-col gap-1">
                      <span className="text-blue-600 font-black text-sm uppercase tracking-widest">AI Word</span>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Click to Open</p>
                    </div>
                  </div>
                </button>
              </motion.div>
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* Sidebar / Controls */}
          <aside className="w-full lg:w-96 bg-white border-r border-slate-200 p-8 flex flex-col gap-10 z-10 relative shadow-2xl shadow-slate-200/50 mt-20 lg:mt-16 overflow-y-auto custom-scrollbar h-auto lg:h-[calc(100vh-64px)]">
        <div className="flex flex-col gap-8">
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className={cn("w-3.5 h-3.5", currentPage === 'word' ? "text-blue-600" : "text-orange-500")} />
              {language === 'English' ? (currentPage === 'word' ? 'Document Topic' : 'Presentation Topic') : (currentPage === 'word' ? 'Θέμα Εγγράφου' : 'Θέμα Παρουσίασης')}
            </label>
            <div className="relative group">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={language === 'English' ? "e.g. The future of Artificial Intelligence..." : "π.χ. Το μέλλον της Τεχνητής Νοημοσύνης..."}
                className={cn(
                  "w-full h-36 p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none transition-all resize-none text-slate-800 font-medium placeholder:text-slate-300 shadow-inner pr-14",
                  currentPage === 'word' ? "focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" : "focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500"
                )}
              />
              <button
                onClick={toggleListening}
                className={cn(
                  "absolute bottom-4 right-4 p-3 rounded-xl transition-all duration-300 shadow-lg active:scale-90",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse shadow-red-200" 
                    : (currentPage === 'word' ? "bg-white text-slate-400 hover:text-blue-600 hover:shadow-blue-100" : "bg-white text-slate-400 hover:text-orange-500 hover:shadow-orange-100")
                )}
                title={language === 'English' ? 'Voice Input' : 'Φωνητική Εισαγωγή'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              {isListening && (
                <div className="absolute top-4 right-4 flex gap-1">
                  <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-red-400 rounded-full" />
                  <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }} className="w-1 bg-red-400 rounded-full" />
                  <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.2 }} className="w-1 bg-red-400 rounded-full" />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Slide Count Dropdown */}
            <div className="space-y-3 relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {language === 'English' ? (currentPage === 'word' ? 'Pages' : 'Slides') : (currentPage === 'word' ? 'Σελίδες' : 'Διαφάνειες')}
              </label>
              <button 
                onClick={() => {
                  setShowSlideMenu(!showSlideMenu);
                  setShowLanguageMenu(false);
                  setShowThemeMenu(false);
                }}
                className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 hover:bg-white hover:shadow-md transition-all group"
              >
                <Layout className={cn("w-4 h-4 text-slate-400 transition-colors", currentPage === 'word' ? "group-hover:text-blue-600" : "group-hover:text-orange-500")} />
                <span className="font-bold text-slate-700">{slideCount}</span>
              </button>
              
              <AnimatePresence>
                {showSlideMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute left-0 mt-3 w-full min-w-[160px] max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 custom-scrollbar"
                  >
                    {proError && (
                      <div className="sticky top-0 z-20 p-3 bg-orange-500 text-white text-[9px] font-black text-center animate-pulse tracking-tighter">
                        {language === 'English' ? 'ENTER PREMIUM TO UNLOCK' : 'ΕΙΣΑΓΕΤΕ PREMIUM ΓΙΑ ΞΕΚΛΕΙΔΩΜΑ'}
                      </div>
                    )}
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        onClick={() => {
                          if (num > 10 && !isPremium) {
                            setProError(true);
                            setTimeout(() => setProError(false), 3000);
                            return;
                          }
                          setSlideCount(num);
                          setShowSlideMenu(false);
                        }}
                        className={cn(
                          "w-full px-5 py-3 text-left text-xs font-bold flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0",
                          slideCount === num ? "text-orange-500 bg-orange-50/50" : "text-slate-600"
                        )}
                      >
                        <span>{num} {num === 1 ? (language === 'English' ? 'Slide' : 'Διαφάνεια') : (language === 'English' ? 'Slides' : 'Διαφάνειες')}</span>
                        {num > 10 && (
                          <span className="text-[8px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm">
                            PREMIUM
                          </span>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Language Dropdown */}
            <div className="space-y-3 relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {language === 'English' ? 'Language' : 'Γλώσσα'}
              </label>
              <button 
                onClick={() => {
                  setShowLanguageMenu(!showLanguageMenu);
                  setShowSlideMenu(false);
                  setShowThemeMenu(false);
                }}
                className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 hover:bg-white hover:shadow-md transition-all group"
              >
                <Languages className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                <span className="font-bold text-slate-700 truncate max-w-[60px]">
                  {language === 'Greek-English' ? 'Bilingual' : language}
                </span>
              </button>

              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    {[
                      { id: 'English', label: 'English' },
                      { id: 'Greek', label: 'Greek' }
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => {
                          setLanguage(lang.id as any);
                          setShowLanguageMenu(false);
                        }}
                        className={cn(
                          "w-full px-5 py-4 text-left text-xs font-bold flex items-center gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0",
                          language === lang.id ? "text-orange-500 bg-orange-50/50" : "text-slate-600"
                        )}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Theme Dropdown */}
          <div className="space-y-3 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {language === 'English' ? (currentPage === 'word' ? 'Document Style' : 'Design Theme') : (currentPage === 'word' ? 'Στυλ Εγγράφου' : 'Θέμα Σχεδίασης')}
            </label>
            <button 
              onClick={() => {
                setShowThemeMenu(!showThemeMenu);
                setShowSlideMenu(false);
                setShowLanguageMenu(false);
              }}
              className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 hover:bg-white hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={cn("w-4 h-4 rounded-full shadow-sm", themes.find(t => t.id === theme)?.color)} />
                <span className="font-bold text-slate-700">
                  {themes.find(t => t.id === theme)?.label}
                </span>
              </div>
              <ChevronRight className={cn("w-5 h-5 text-slate-300 transition-transform duration-300", showThemeMenu && (currentPage === 'word' ? "rotate-90 text-blue-600" : "rotate-90 text-orange-500"))} />
            </button>

            <AnimatePresence>
              {showThemeMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 mt-3 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t.id);
                        setShowThemeMenu(false);
                      }}
                      className={cn(
                        "w-full px-5 py-4 text-left text-xs font-bold flex items-center gap-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0",
                        theme === t.id 
                          ? (currentPage === 'word' ? "text-blue-600 bg-blue-50/50" : "text-orange-500 bg-orange-50/50") 
                          : "text-slate-600"
                      )}
                    >
                      <div className={cn("w-3.5 h-3.5 rounded-full shadow-sm", t.color)} />
                      {t.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner">
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg shadow-sm">
                <ImageIcon className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                {language === 'English' ? 'AI Images' : 'Εικόνες AI'}
              </span>
            </div>
            <button
              onClick={() => setIncludeImages(!includeImages)}
              className={cn(
                "w-14 h-7 rounded-full transition-all duration-300 relative shadow-inner",
                includeImages ? "bg-orange-500" : "bg-slate-300"
              )}
            >
              <motion.div 
                animate={{ x: includeImages ? 30 : 4 }}
                className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md"
              />
            </button>
          </div>

          <button
            onClick={handleCreate}
            disabled={isGenerating || !topic.trim()}
            className={cn(
              "w-full py-5 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95 disabled:shadow-none disabled:bg-slate-300",
              currentPage === 'word' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-slate-900 hover:bg-slate-800 shadow-slate-200"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {language === 'English' ? 'Crafting...' : 'Δημιουργία...'}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                {language === 'English' ? (currentPage === 'word' ? 'Generate Document' : 'Generate Slides') : (currentPage === 'word' ? 'Δημιουργία Εγγράφου' : 'Δημιουργία Παρουσίασης')}
              </>
            )}
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            Powered by Gemini AI & {currentPage === 'word' ? 'Word' : 'PowerPoint'} AI
          </p>
        </div>
      </aside>

      {/* Main Content / Preview */}
      <main className={cn(
        "flex-1 bg-slate-50 p-6 lg:p-16 flex flex-col items-center relative overflow-hidden mt-20 lg:mt-16",
        currentPage === 'word' ? "justify-start" : "justify-center"
      )}>
        {/* Background Decoration */}
        <div className={cn(
          "absolute top-0 right-0 w-[40rem] h-[40rem] rounded-full blur-[120px] -mr-80 -mt-80 animate-pulse",
          currentPage === 'word' ? "bg-blue-100/40" : "bg-orange-100/40"
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-[40rem] h-[40rem] rounded-full blur-[120px] -ml-80 -mb-80 animate-pulse",
          currentPage === 'word' ? "bg-blue-100/40" : "bg-blue-100/40"
        )} />

        <AnimatePresence mode="wait">
          {slides.length > 0 ? (
            <motion.div 
              key="viewer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-5xl flex flex-col gap-6"
            >
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <Layout className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                    {currentPage === 'word' 
                      ? (language === 'English' ? 'Document View' : 'Προβολή Εγγράφου')
                      : `${language === 'English' ? 'Slide' : 'Διαφάνεια'} ${currentSlideIndex + 1} / ${slides.length}`
                    }
                  </span>
                </div>
                
                <div className="relative">
                  <button
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    disabled={isExporting}
                    className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-orange-500" />
                    )}
                    {language === 'English' ? 'Export' : 'Εξαγωγή'}
                  </button>

                  <AnimatePresence>
                    {showDownloadMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-3 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden p-2"
                      >
                        {currentPage === 'word' ? (
                          <button 
                            onClick={downloadDocx}
                            className="w-full px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all flex items-center gap-4 group"
                          >
                            <div className="bg-blue-100 p-2 rounded-lg group-hover:bg-blue-500 transition-colors">
                              <WordIcon className="w-4 h-4 text-blue-600 group-hover:text-white" />
                            </div>
                            Word Document (.docx)
                          </button>
                        ) : (
                          <button
                            onClick={downloadPptx}
                            className="w-full px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-orange-50 hover:text-orange-600 rounded-xl transition-all flex items-center gap-4 group"
                          >
                            <div className="bg-orange-100 p-2 rounded-lg group-hover:bg-orange-500 transition-colors">
                              <Presentation className="w-4 h-4 text-orange-600 group-hover:text-white" />
                            </div>
                            PowerPoint (.pptx)
                          </button>
                        )}
                        <button
                          onClick={downloadPdf}
                          className="w-full px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all flex items-center gap-4 group"
                        >
                          <div className="bg-blue-100 p-2 rounded-lg group-hover:bg-blue-500 transition-colors">
                            <FileText className="w-4 h-4 text-blue-600 group-hover:text-white" />
                          </div>
                          PDF Document (.pdf)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Slide Container / Document View */}
              {currentPage === 'word' ? (
                <div className="flex-1 w-full overflow-y-auto custom-scrollbar p-4 lg:p-12 flex flex-col items-center gap-12 max-h-[calc(100vh-250px)]">
                  {slides.map((slide, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white w-full max-w-[850px] aspect-[1/1.414] shadow-2xl rounded-sm p-12 lg:p-24 relative group border border-slate-200 flex flex-col gap-12 shrink-0"
                    >
                      <div className="space-y-4 shrink-0">
                        <div className="w-12 h-1.5 rounded-full bg-blue-600" />
                        <h2 
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => updateSlideTitle(index, e.currentTarget.textContent || '')}
                          className={cn(
                            "font-display font-bold leading-[1.1] tracking-tight outline-none rounded-lg px-2 -ml-2 transition-all focus:ring-2 focus:ring-blue-500/20 text-slate-900",
                            getTitleSizeClass(slide.title)
                          )}
                        >
                          {slide.title}
                        </h2>
                      </div>

                      <div className="flex-1 flex flex-col lg:flex-row gap-12 min-h-0">
                        <div className="flex-1 min-h-0">
                          <AutoFitText 
                            maxFontSize={20} 
                            minFontSize={10}
                            className="text-slate-600"
                          >
                            <ul className="space-y-6">
                              {slide.content.map((point, i) => (
                                <li key={i} className="flex items-start gap-5 group/item">
                                  <FountainPenIcon className="mt-1" />
                                  <span 
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => updateSlideContent(index, i, e.currentTarget.textContent || '')}
                                    className="font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/20 rounded-lg px-2 -ml-2 transition-all w-full"
                                  >
                                    {point}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </AutoFitText>
                        </div>

                        {includeImages && slide.imageUrl && (
                          <div className="w-full lg:w-1/3 aspect-square rounded-2xl overflow-hidden shadow-xl border border-slate-100 shrink-0">
                            <img src={slide.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                      </div>

                      <div className="absolute bottom-12 right-12 text-slate-300 font-mono text-xs tracking-widest flex flex-col items-end gap-1">
                        {!isPremium && (
                          <span className="text-[10px] font-display font-black text-slate-400/30 uppercase tracking-[0.3em]">filip Studio</span>
                        )}
                        <span>PAGE {index + 1} / {slides.length}</span>
                      </div>
                    </motion.div>
                  ))}

                  {/* Add Page Button in Document View */}
                  <button
                    onClick={handleAddSlide}
                    disabled={isGenerating}
                    className="w-full max-w-[850px] py-16 border-2 border-dashed border-slate-300 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-all group/add disabled:opacity-50 shrink-0"
                  >
                    <Plus className="w-10 h-10 group-hover/add:scale-110 transition-transform" />
                    <span className="font-black uppercase tracking-[0.2em] text-sm">Add New Page</span>
                  </button>
                </div>
              ) : (
                <>
                  <div 
                    id="slide-content"
                    className={cn(
                    "relative aspect-video w-full rounded-[2.5rem] slide-shadow overflow-hidden group transition-all duration-700 border-8 border-white",
                    theme === 'Modern' && "bg-white",
                    theme === 'Classic' && "bg-slate-50",
                    theme === 'Vibrant' && "bg-indigo-50",
                    theme === 'Dark' && "bg-slate-900",
                    theme === 'Professional' && "bg-slate-100",
                    theme === 'Creative' && "bg-orange-50",
                    theme === 'Minimalist' && "bg-white",
                    theme === 'Corporate' && "bg-blue-50"
                  )}>
                    {slideCount > 10 && !isPremium && (
                      <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-8">
                        <div className="bg-white p-8 rounded-3xl shadow-2xl text-center space-y-4 max-w-sm animate-float">
                          <div className="bg-orange-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
                            <Crown className="w-8 h-8 text-orange-500" />
                          </div>
                          <h4 className="text-xl font-display font-bold text-slate-900">Premium Required</h4>
                          <p className="text-sm text-slate-500">Unlock up to 15 slides and exclusive themes with a premium code.</p>
                          <button 
                            onClick={() => setShowProModal(true)}
                            className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100"
                          >
                            Upgrade Now
                          </button>
                        </div>
                      </div>
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={currentSlideIndex}
                        initial={{ opacity: 0, x: 40, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, x: -40, filter: 'blur(10px)' }}
                        transition={{ 
                          duration: 0.6, 
                          ease: [0.22, 1, 0.36, 1] // Custom cubic-bezier for smoother feel
                        }}
                        className="absolute inset-0 p-12 lg:p-20 flex flex-col lg:flex-row gap-16"
                      >
                        <div className="flex-1 flex flex-col gap-10 z-10 overflow-hidden">
                          <div className="space-y-2 shrink-0">
                            <div className={cn(
                              "w-12 h-1.5 rounded-full",
                              currentPage === 'word' ? "bg-blue-600" : (
                                theme === 'Green' ? "bg-green-600" : (
                                  theme === 'Blue' ? "bg-blue-500" : "bg-orange-500"
                                )
                              )
                            )} />
                            <h2 
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => updateSlideTitle(currentSlideIndex, e.currentTarget.textContent || '')}
                              className={cn(
                                "font-display font-bold leading-[1.1] tracking-tight outline-none rounded-lg px-2 -ml-2 transition-all",
                                currentPage === 'word' ? "focus:ring-2 focus:ring-blue-500/20" : "focus:ring-2 focus:ring-orange-500/20",
                                getTitleSizeClass(slides[currentSlideIndex].title),
                                theme === 'Dark' ? "text-white" : (
                                  theme === 'Green' ? "text-green-900" : (
                                    theme === 'Blue' ? "text-blue-900" : "text-slate-900"
                                  )
                                )
                              )}
                            >
                              {slides[currentSlideIndex].title}
                            </h2>
                          </div>
                          
                          <div className="flex-1 min-h-0">
                            <AutoFitText 
                              maxFontSize={24} 
                              minFontSize={10}
                              className={cn(
                                "custom-scrollbar",
                                theme === 'Dark' ? "text-slate-300" : (
                                  theme === 'Green' ? "text-green-900" : (
                                    theme === 'Blue' ? "text-blue-900" : "text-slate-600"
                                  )
                                )
                              )}
                            >
                              <ul className="space-y-6">
                                {slides[currentSlideIndex].content.map((point, i) => (
                                  <motion.li 
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.1 }}
                                    className="flex items-start gap-5 group/item"
                                  >
                                    {currentPage === 'word' ? (
                                      <FountainPenIcon className="mt-1" />
                                    ) : (
                                      <div className={cn(
                                        "mt-2.5 w-2.5 h-2.5 rounded-full shrink-0 shadow-sm",
                                        currentPage === 'word' ? "bg-blue-600" : (
                                          theme === 'Modern' && "bg-orange-500" ||
                                          theme === 'Classic' && "bg-blue-600" ||
                                          theme === 'Vibrant' && "bg-purple-500" ||
                                          theme === 'Dark' && "bg-orange-400" ||
                                          theme === 'Professional' && "bg-slate-900" ||
                                          theme === 'Creative' && "bg-orange-600" ||
                                          theme === 'Minimalist' && "bg-black" ||
                                          theme === 'Corporate' && "bg-blue-800" ||
                                          theme === 'Green' && "bg-green-600" ||
                                          theme === 'Blue' && "bg-blue-500"
                                        )
                                      )} />
                                    )}
                                    <span 
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => updateSlideContent(currentSlideIndex, i, e.currentTarget.textContent || '')}
                                      className={cn(
                                        "font-medium leading-relaxed outline-none rounded-lg px-2 -ml-2 transition-all w-full",
                                        currentPage === 'word' ? "focus:ring-2 focus:ring-blue-500/20" : "focus:ring-2 focus:ring-orange-500/20"
                                      )}
                                    >
                                      {point}
                                    </span>
                                  </motion.li>
                                ))}
                              </ul>
                            </AutoFitText>
                          </div>
                        </div>

                        {includeImages && (
                          <div 
                            className="relative z-10 group/img"
                            style={{ 
                              width: slides[currentSlideIndex].imageWidth ? `${slides[currentSlideIndex].imageWidth}%` : '45%',
                              height: slides[currentSlideIndex].imageHeight ? `${slides[currentSlideIndex].imageHeight}%` : 'auto',
                              minWidth: '20%',
                              minHeight: '20%'
                            }}
                          >
                            <div className="w-full h-full rounded-[2rem] bg-slate-100/50 border border-slate-200/50 overflow-hidden relative shadow-2xl">
                              {slides[currentSlideIndex].imageUrl ? (
                                <motion.img 
                                  initial={{ scale: 1.1, opacity: 0, filter: 'blur(20px)' }}
                                  animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                                  transition={{ 
                                    duration: 1,
                                    ease: "easeOut"
                                  }}
                                  src={slides[currentSlideIndex].imageUrl} 
                                  alt={slides[currentSlideIndex].title}
                                  className="w-full h-full object-cover transition-transform duration-1000 group-hover/img:scale-110"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400 bg-slate-50 overflow-hidden">
                                  <motion.div 
                                    animate={{ 
                                      x: ['-100%', '100%'],
                                    }}
                                    transition={{ 
                                      repeat: Infinity, 
                                      duration: 1.5, 
                                      ease: "linear" 
                                    }}
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
                                  />
                                  <div className="relative">
                                    <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                                    <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-orange-300 animate-pulse" />
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 relative z-10">
                                    {language === 'English' ? 'AI Rendering...' : 'Δημιουργία...'}
                                  </span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500" />
                            </div>

                            {/* Resize Handles */}
                            <div className="absolute -inset-2 border-2 border-orange-500 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none rounded-[2.2rem]" />
                            <div 
                              className="absolute -bottom-1 -right-1 w-6 h-6 bg-orange-500 rounded-full border-2 border-white cursor-nwse-resize opacity-0 group-hover/img:opacity-100 transition-opacity z-20 shadow-lg flex items-center justify-center"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const startW = slides[currentSlideIndex].imageWidth || 45;
                                const startH = slides[currentSlideIndex].imageHeight || 60;

                                const onMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = (moveEvent.clientX - startX) / 10;
                                  const deltaY = (moveEvent.clientY - startY) / 10;
                                  updateSlideImageSize(
                                    Math.max(20, Math.min(80, startW + deltaX)),
                                    Math.max(20, Math.min(80, startH + deltaY))
                                  );
                                };

                                const onMouseUp = () => {
                                  window.removeEventListener('mousemove', onMouseMove);
                                  window.removeEventListener('mouseup', onMouseUp);
                                };

                                window.addEventListener('mousemove', onMouseMove);
                                window.addEventListener('mouseup', onMouseUp);
                              }}
                            >
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          </div>
                        )}

                        <div className="absolute bottom-12 right-12 text-slate-300 font-mono text-xs tracking-widest flex flex-col items-end gap-1">
                          {!isPremium && (
                            <span className="text-[10px] font-display font-black text-slate-400/30 uppercase tracking-[0.3em]">filip Studio</span>
                          )}
                          <span>PAGE {currentSlideIndex + 1} / {slides.length}</span>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Navigation Arrows */}
                    <button
                      onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentSlideIndex === 0}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-0 transition-all shadow-lg"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                      disabled={currentSlideIndex === slides.length - 1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-0 transition-all shadow-lg"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Thumbnails & Add Slide */}
                  <div className="relative flex items-center group/thumbs">
                    <button 
                      onClick={() => scrollThumbnails('left')}
                      className="absolute left-0 z-10 p-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-lg text-slate-600 hover:text-orange-500 opacity-0 group-hover/thumbs:opacity-100 transition-opacity -ml-4"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div 
                      ref={thumbnailRef}
                      className="flex gap-3 overflow-x-auto pb-4 px-2 no-scrollbar items-center scroll-smooth"
                    >
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentSlideIndex(i)}
                          className={cn(
                            "shrink-0 w-24 aspect-video rounded-lg border-2 transition-all overflow-hidden relative group/thumb",
                            currentSlideIndex === i ? "border-orange-500 scale-105 shadow-md" : "border-transparent hover:border-slate-300"
                          )}
                        >
                          <div className="absolute inset-0 bg-white flex items-center justify-center text-xs font-bold text-slate-400 group-hover/thumb:text-orange-500">
                            {i + 1}
                          </div>
                          {slides[i].imageUrl && (
                            <img 
                              src={slides[i].imageUrl} 
                              className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover/thumb:opacity-60 transition-opacity" 
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </button>
                      ))}
                      
                      {/* Add Slide Button */}
                      <button
                        onClick={handleAddSlide}
                        disabled={isGenerating}
                        className="shrink-0 w-24 aspect-video rounded-lg border-2 border-dashed border-slate-300 hover:border-orange-500 hover:bg-orange-50 transition-all flex flex-col items-center justify-center gap-1 group/add disabled:opacity-50"
                      >
                        <Plus className="w-5 h-5 text-slate-400 group-hover/add:text-orange-500 transition-colors" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover/add:text-orange-500">Add Slide</span>
                      </button>
                    </div>

                    <button 
                      onClick={() => scrollThumbnails('right')}
                      className="absolute right-0 z-10 p-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-lg text-slate-600 hover:text-orange-500 opacity-0 group-hover/thumbs:opacity-100 transition-opacity -mr-4"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 max-w-md"
            >
              <div className="relative inline-block">
                <div className="bg-white p-8 rounded-3xl slide-shadow relative z-10">
                  <Presentation className="w-20 h-20 text-orange-500 mx-auto" />
                </div>
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-blue-500 rounded-2xl rotate-12 flex items-center justify-center shadow-lg">
                  <Sparkles className="text-white w-6 h-6" />
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-2xl font-display font-bold text-slate-900">
                  {language === 'English' ? 'Ready to create?' : 'Έτοιμοι για δημιουργία;'}
                </h3>
                <p className="text-slate-500 leading-relaxed">
                  {language === 'English' 
                    ? 'Enter a topic on the left and watch AI build your professional presentation in seconds.' 
                    : 'Εισαγάγετε ένα θέμα στα αριστερά και δείτε το AI να δημιουργεί την επαγγελματική σας παρουσίαση σε δευτερόλεπτα.'}
                </p>
              </div>

              {isGenerating && (
                <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  <p className="text-sm font-bold text-slate-600 animate-pulse">
                    {generationStep}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )}

      {/* Pro Modal */}
      <AnimatePresence>
        {isExporting && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-12 shadow-2xl text-center space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                <motion.div 
                  className={cn("h-full transition-all duration-500", currentPage === 'word' ? "bg-blue-600" : "bg-orange-500")}
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              
              <div className={cn("w-24 h-24 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl animate-bounce", currentPage === 'word' ? "bg-blue-600 shadow-blue-200" : "bg-orange-500 shadow-orange-200")}>
                <Download className="w-10 h-10 text-white" />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-3xl font-display font-black text-slate-900 tracking-tight">
                  {language === 'English' ? 'Exporting...' : 'Εξαγωγή...'}
                </h3>
                <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">
                  {exportProgress > 0 ? `${exportProgress}% ${language === 'English' ? 'Complete' : 'Ολοκληρώθηκε'}` : (language === 'English' ? 'Preparing your file' : 'Προετοιμασία αρχείου')}
                </p>
              </div>

              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className={cn("w-2 h-2 rounded-full", currentPage === 'word' ? "bg-blue-600" : "bg-orange-500")}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {showProModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />
              
              <button 
                onClick={() => setShowProModal(false)}
                className="absolute top-6 right-6 p-2.5 hover:bg-slate-100 rounded-2xl transition-all duration-300 group"
              >
                <X className="w-5 h-5 text-slate-400 group-hover:text-slate-900 group-hover:rotate-90 transition-all" />
              </button>

              <div className="text-center space-y-8">
                <div className="relative inline-block">
                  <div className="bg-orange-500 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl shadow-orange-200 animate-float">
                    <Crown className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-xl shadow-lg">
                    <Sparkles className="w-5 h-5 text-orange-500 animate-pulse" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-3xl font-display font-black text-slate-900 tracking-tight">Unlock Premium</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">Enter your exclusive code to access unlimited slides and professional themes.</p>
                </div>

                <div className="space-y-5">
                  <div className="relative group">
                    <input 
                      type="text"
                      value={proCode}
                      onChange={(e) => setProCode(e.target.value)}
                      placeholder="••••••"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-center font-mono text-2xl tracking-[0.5em] transition-all placeholder:text-slate-200"
                    />
                  </div>
                  <button 
                    onClick={handleProCodeSubmit}
                    className="w-full py-5 bg-orange-500 hover:bg-orange-600 text-white rounded-3xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-orange-200 active:scale-95 hover:-translate-y-1"
                  >
                    Activate Access
                  </button>
                </div>

                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Lifetime Premium Access</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Panel */}
      <AnimatePresence>
        {showAdminPanel && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="bg-white w-full max-w-3xl rounded-[3rem] p-12 shadow-2xl max-h-[85vh] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-3 bg-slate-900" />
              
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-5">
                  <div className="bg-slate-900 p-3 rounded-2xl shadow-lg">
                    <Settings className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-display font-black text-slate-900 tracking-tight">Admin Control</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Premium Access</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAdminPanel(false)}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-all duration-300 group"
                >
                  <X className="w-6 h-6 text-slate-400 group-hover:text-slate-900 group-hover:rotate-90 transition-all" />
                </button>
              </div>

              <div className="flex gap-5 mb-10">
                <div className="flex-1 relative group">
                  <input 
                    type="text"
                    value={newAdminCode}
                    onChange={(e) => setNewAdminCode(e.target.value)}
                    placeholder="Generate new code..."
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none font-mono font-bold text-slate-700 transition-all"
                  />
                </div>
                <button 
                  onClick={addCode}
                  className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                >
                  Create Code
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adminCodes.map((c) => (
                    <motion.div 
                      layout
                      key={c.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl group hover:bg-white hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="font-mono font-black text-slate-700 tracking-wider">{c.code}</span>
                        {c.used && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold uppercase">Used</span>
                        )}
                      </div>
                      <button 
                        onClick={() => removeCode(c.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                  {adminCodes.length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-4">
                      <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
                        <Settings className="w-10 h-10 text-slate-200" />
                      </div>
                      <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No active codes found</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
