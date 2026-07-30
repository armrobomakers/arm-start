#property strict
#property script_show_inputs

#define DIR "ARMIndicator"
#define TMP "ARMIndicator/symbol-metadata.csv.tmp"
#define OUT "ARMIndicator/symbol-metadata.csv"

bool Secure()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1 || AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 || AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     {
      Print("CRITICAL: metadata exporter security check failed");
      return false;
     }
   return true;
  }

bool HasSymbol(string &items[],const string symbol)
  {
   for(int i=0;i<ArraySize(items);i++) if(items[i]==symbol) return true;
   return false;
  }

int OnStart()
  {
   if(!Secure()) return 1;
   if(!HistorySelect(0,TimeCurrent())) { PrintFormat("CRITICAL: HistorySelect failed, error=%d",GetLastError()); return 2; }
   string symbols[];
   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++)
     {
      ulong ticket=HistoryDealGetTicket(i);
      string symbol=HistoryDealGetString(ticket,DEAL_SYMBOL);
      if(symbol!="" && !HasSymbol(symbols,symbol)) { int n=ArraySize(symbols); ArrayResize(symbols,n+1); symbols[n]=symbol; }
     }
   FolderCreate(DIR,FILE_COMMON);
   FileDelete(TMP,FILE_COMMON);
   int file=FileOpen(TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(file==INVALID_HANDLE) { PrintFormat("CRITICAL: output open failed, error=%d",GetLastError()); return 3; }
   FileWrite(file,"symbol","currency_base","currency_profit","currency_margin","trade_calc_mode","trade_contract_size","point","digits","volume_min","volume_step","account_currency");
   string account_currency=AccountInfoString(ACCOUNT_CURRENCY);
   for(int i=0;i<ArraySize(symbols);i++)
     {
      string symbol=symbols[i];
      long calc_mode=0,digits=0;
      SymbolInfoInteger(symbol,SYMBOL_TRADE_CALC_MODE,calc_mode);
      SymbolInfoInteger(symbol,SYMBOL_DIGITS,digits);
      FileWrite(file,symbol,
                SymbolInfoString(symbol,SYMBOL_CURRENCY_BASE),
                SymbolInfoString(symbol,SYMBOL_CURRENCY_PROFIT),
                SymbolInfoString(symbol,SYMBOL_CURRENCY_MARGIN),
                calc_mode,SymbolInfoDouble(symbol,SYMBOL_TRADE_CONTRACT_SIZE),
                SymbolInfoDouble(symbol,SYMBOL_POINT),digits,
                SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN),SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP),account_currency);
     }
   FileFlush(file); FileClose(file);
   if(!FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)) { PrintFormat("CRITICAL: replacement failed, error=%d",GetLastError()); FileDelete(TMP,FILE_COMMON); return 4; }
   PrintFormat("SYMBOL METADATA FINISHED symbols=%d",ArraySize(symbols));
   return 0;
  }
