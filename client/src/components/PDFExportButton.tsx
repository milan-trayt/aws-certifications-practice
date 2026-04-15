import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MockTestResult {
  id: number;
  testId: string;
  testName: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  completedAt: string;
  passingScore: number;
  passed: boolean;
  percentage: number;
  scaledScore: number;
}

interface PDFExportButtonProps {
  testName: string;
  userName: string;
  mockTestHistory: MockTestResult[];
}

const PDFExportButton: React.FC<PDFExportButtonProps> = ({ testName, userName, mockTestHistory }) => {
  const [isExporting, setIsExporting] = useState(false);

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const generatePDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const exportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Title
      doc.setFontSize(18);
      doc.text('Test History Report', 14, 20);

      // User info and export date
      doc.setFontSize(11);
      doc.text(`Name: ${userName}`, 14, 32);
      doc.text(`Test: ${testName}`, 14, 39);
      doc.text(`Export Date: ${exportDate}`, 14, 46);

      // Overall statistics
      const totalTests = mockTestHistory.length;
      const averageScore = totalTests > 0
        ? Math.round(mockTestHistory.reduce((sum, t) => sum + t.score, 0) / totalTests)
        : 0;
      const averagePercentage = totalTests > 0
        ? Math.round(mockTestHistory.reduce((sum, t) => sum + t.percentage, 0) / totalTests)
        : 0;

      doc.setFontSize(13);
      doc.text('Overall Statistics', 14, 58);
      doc.setFontSize(11);
      doc.text(`Total Tests Taken: ${totalTests}`, 14, 66);
      doc.text(`Average Score: ${averageScore}`, 14, 73);
      doc.text(`Average Percentage: ${averagePercentage}%`, 14, 80);

      // Results table
      if (totalTests > 0) {
        doc.setFontSize(13);
        doc.text('Test Results', 14, 94);

        const tableData = mockTestHistory.map((test) => [
          formatDate(test.completedAt),
          `${test.score}/${test.totalQuestions}`,
          `${test.percentage}%`,
          `${test.scaledScore}/1000`,
          test.passed ? 'PASS' : 'FAIL',
        ]);

        autoTable(doc, {
          startY: 98,
          head: [['Date', 'Score', 'Percentage', 'Scaled Score', 'Status']],
          body: tableData,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [41, 128, 185] },
          columnStyles: {
            4: {
              fontStyle: 'bold',
            },
          },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 4) {
              data.cell.styles.textColor = data.cell.raw === 'PASS' ? [39, 174, 96] : [231, 76, 60];
            }
          },
        });
      }

      const safeName = testName.replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`${safeName}_history_${Date.now()}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      className="export-pdf-btn"
      onClick={generatePDF}
      disabled={isExporting || mockTestHistory.length === 0}
      aria-label="Export test history as PDF"
    >
      {isExporting ? 'Exporting…' : <><FileText size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Export PDF</>}
    </button>
  );
};

export default PDFExportButton;
