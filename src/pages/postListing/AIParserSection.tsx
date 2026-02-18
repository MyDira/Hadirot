import React from "react";
import { Sparkles, Edit, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

interface AIParserSectionProps {
  showAIParser: boolean;
  setShowAIParser: (v: boolean) => void;
  aiParserText: string;
  setAiParserText: (v: string) => void;
  aiParserLoading: boolean;
  aiParserError: string | null;
  setAiParserError: (v: string | null) => void;
  aiParserSuccess: boolean;
  setAiParserSuccess: (v: boolean) => void;
  isAIParsed: boolean;
  originalParsedText: string;
  showOriginalText: boolean;
  setShowOriginalText: (v: boolean) => void;
  onParse: () => void;
  onClear: () => void;
}

export function AIParserSection({
  showAIParser,
  setShowAIParser,
  aiParserText,
  setAiParserText,
  aiParserLoading,
  aiParserError,
  setAiParserError,
  aiParserSuccess,
  setAiParserSuccess,
  isAIParsed,
  originalParsedText,
  showOriginalText,
  setShowOriginalText,
  onParse,
  onClear,
}: AIParserSectionProps) {
  return (
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-blue-500 p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-shrink-0">
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
              Admin Only
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-blue-700 mb-1">
              📋 Quick Fill from Text
            </h2>
            <p className="text-sm text-gray-600">
              Paste a listing from WhatsApp, email, or any text source and AI will automatically fill the form
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAIParser(!showAIParser);
            if (showAIParser) {
              setAiParserError(null);
              setAiParserSuccess(false);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          {showAIParser ? (
            <>
              <Edit className="w-4 h-4" />
              Fill Form Manually
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Use AI Parser
            </>
          )}
        </button>
      </div>

      {showAIParser && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste Listing Text
            </label>
            <textarea
              value={aiParserText}
              onChange={(e) => {
                setAiParserText(e.target.value);
                setAiParserError(null);
              }}
              rows={10}
              disabled={aiParserLoading}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm bg-white"
              placeholder="Paste listing text here..."
            />
            <p className="text-xs text-gray-500 mt-2">
              AI will extract property details like bedrooms, price, location, amenities, etc.
            </p>
          </div>

          {aiParserError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Parse Error</p>
                <p className="text-sm text-red-700 mt-1">{aiParserError}</p>
              </div>
            </div>
          )}

          {aiParserSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">✅ Parsed successfully! Review the fields below.</p>

                  {originalParsedText && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setShowOriginalText(!showOriginalText)}
                        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900 font-medium"
                      >
                        {showOriginalText ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide original text
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            View original text
                          </>
                        )}
                      </button>

                      {showOriginalText && (
                        <div className="mt-2 p-3 bg-white border border-green-200 rounded-md">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                            {originalParsedText}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={onParse}
              disabled={aiParserLoading || !aiParserText.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold text-base shadow-md"
              data-testid="ai-parse-button"
            >
              {aiParserLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Auto-Fill Form
                </>
              )}
            </button>

            {isAIParsed && (
              <button
                type="button"
                onClick={onClear}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-base shadow-sm"
              >
                Clear & Start Over
              </button>
            )}
          </div>
        </div>
      )}

      {!showAIParser && isAIParsed && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <CheckCircle2 className="w-5 h-5 text-blue-600" />
          <p className="text-sm text-blue-700 font-medium">
            Form populated with AI-parsed data
          </p>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear & Start Over
          </button>
        </div>
      )}
    </div>
  );
}
